import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import {
  AssetId,
  MAX_WIDGET_HTML_BYTES,
  MAX_WIDGET_INLINE_HTML_BYTES,
  type WidgetSource,
  type Widget,
} from "@avenire/contracts";
import { ObjectNotFound, type StorageError } from "@avenire/storage/storage";
import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import { buildWidgetDocument } from "@avenire/ui/widget-protocol";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { AssetStore, type StoredAsset } from "./assets.ts";
import { type AgentContext, RuthToolError } from "../tools/core.ts";

export const WIDGET_TOKEN_LIFETIME_MS = 10 * 60_000;
export const signWidgetToken = (id: AssetId, expiresAt: number, secret: string): string => {
  const payload = `${Buffer.from(id).toString("base64url")}.${expiresAt}`;
  return `${payload}.${createHmac("sha256", secret).update(`widget:${payload}`).digest("base64url")}`;
};
export const verifyWidgetToken = (
  token: string,
  now: number,
  secret: string,
): Option.Option<AssetId> => {
  const parts = token.split(".");
  if (parts.length !== 3) return Option.none();
  const [encoded, expiry, signature] = parts as [string, string, string];
  if (!/^[\w-]+$/.test(encoded) || !/^\d+$/.test(expiry) || !/^[\w-]+$/.test(signature))
    return Option.none();
  const expires = Number(expiry);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + WIDGET_TOKEN_LIFETIME_MS)
    return Option.none();
  const id = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = createHmac("sha256", secret).update(`widget:${encoded}.${expiry}`).digest();
  const supplied = Buffer.from(signature, "base64url");
  return id &&
    Buffer.from(id).toString("base64url") === encoded &&
    supplied.toString("base64url") === signature &&
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
    ? Option.some(AssetId.make(id))
    : Option.none();
};
/** Resolve only this thread's sandbox, checking size before downloading. Never echo source. */
export const resolveWidgetSource = Effect.fn("Widget.resolveSource")(function* (
  ctx: AgentContext,
  input: WidgetSource,
) {
  const invalid = (message: string) =>
    new RuthToolError({
      tool: "render_widget",
      code: "invalid_input",
      message,
      recoverable: true,
    });
  if ((typeof input.html === "string") === (typeof input.path === "string"))
    return yield* invalid("Pass exactly one of html or path.");
  if (input.html !== undefined) {
    if (Buffer.byteLength(input.html) > MAX_WIDGET_INLINE_HTML_BYTES)
      return yield* invalid(
        "Inline HTML exceeds 512,000 bytes. Build in the sandbox and pass path.",
      );
    return input.html;
  }
  if (!ctx.threadId) return yield* invalid("A thread is required for a widget path.");
  if (!input.path.toLowerCase().endsWith(".html"))
    return yield* invalid("Widget path must name an HTML file.");
  const sandboxes = yield* ChatSandboxes;
  const file = yield* sandboxes
    .readArtifact(
      { userId: ctx.userId, threadId: ctx.threadId },
      { path: input.path, maxBytes: MAX_WIDGET_HTML_BYTES },
    )
    .pipe(
      Effect.mapError(() =>
        invalid("Cannot read the thread's HTML file; check the path and 8 MiB limit."),
      ),
    );
  return yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(file.bytes),
    catch: () => invalid("Widget HTML must be UTF-8."),
  });
});
/** Preview and render share the exact validation, CSP and first-paint bootstrap. */
export const wrapWidget = Effect.fn("WidgetStore.wrap")(function* (
  ctx: AgentContext,
  input: { readonly html: string; readonly title: string },
  kitsOrigin: string,
  appearance?: "light" | "dark",
) {
  if (Buffer.byteLength(input.html) > MAX_WIDGET_HTML_BYTES)
    return yield* new RuthToolError({
      tool: "render_widget",
      code: "invalid_input",
      message: `Widget HTML must be at most ${MAX_WIDGET_HTML_BYTES} bytes.`,
      recoverable: true,
    });
  const scheme = appearance ?? ctx.page?.colorScheme ?? "light";
  return yield* Effect.try({
    try: () =>
      buildWidgetDocument({
        html: input.html,
        title: input.title,
        colorScheme: scheme,
        tokens: {
          ...(ctx.page?.colorScheme === scheme ? ctx.page.themeTokens : {}),
          ...WIDGET_THEME_TOKENS[scheme],
        },
        kitsOrigin,
      }),
    catch: () =>
      new RuthToolError({
        tool: "render_widget",
        code: "invalid_input",
        message: "The widget configuration is invalid.",
        recoverable: false,
      }),
  });
});
type AssetPutError = Effect.Error<ReturnType<AssetStore["Service"]["put"]>>;
type AssetGetError = Effect.Error<ReturnType<AssetStore["Service"]["get"]>>;
export class WidgetStore extends Context.Service<
  WidgetStore,
  {
    readonly origin: string;
    readonly frameAncestors: ReadonlyArray<string>;
    readonly render: (
      ctx: AgentContext,
      input: { readonly title: string; readonly html: string },
    ) => Effect.Effect<Widget, RuthToolError | AssetPutError, Crypto.Crypto>;
    readonly url: (asset: StoredAsset) => Effect.Effect<string>;
    readonly load: (
      token: string,
    ) => Effect.Effect<Uint8Array, ObjectNotFound | StorageError | AssetGetError>;
  }
>()("avenire/ai/WidgetStore") {}
export const makeWidgetStore = Effect.fn("WidgetStore.make")(function* (options: {
  readonly origin: string;
  readonly secret: Redacted.Redacted<string>;
  readonly frameAncestors: ReadonlyArray<string>;
}) {
  const assets = yield* AssetStore;
  return WidgetStore.of({
    origin: options.origin,
    frameAncestors: options.frameAncestors,
    url: Effect.fn("WidgetStore.url")(function* (asset) {
      const now = yield* Clock.currentTimeMillis;
      return `${options.origin}/w/${signWidgetToken(asset.id, now + WIDGET_TOKEN_LIFETIME_MS, Redacted.value(options.secret))}`;
    }),
    load: Effect.fn("WidgetStore.load")(function* (token) {
      const id = verifyWidgetToken(
        token,
        yield* Clock.currentTimeMillis,
        Redacted.value(options.secret),
      );
      if (Option.isNone(id)) return yield* new ObjectNotFound({ key: "widget" });
      const resolved = yield* assets.get(id.value);
      if (Option.isNone(resolved) || resolved.value.kind !== "widget")
        return yield* new ObjectNotFound({ key: "widget" });
      return yield* assets.load(resolved.value);
    }),
    render: Effect.fn("WidgetStore.render")(function* (ctx, input) {
      const document = yield* wrapWidget(ctx, input, options.origin);
      const stored = yield* assets.put(ctx.userId, {
        name: "widget.html",
        title: input.title,
        kind: "widget",
        bytes: new TextEncoder().encode(document),
        mediaType: "text/html",
        ...(ctx.threadId ? { threadId: ctx.threadId } : {}),
        ...(ctx.runId ? { runId: ctx.runId } : {}),
      });
      return { assetId: stored.id, title: stored.title, url: stored.url };
    }),
  });
});
export const WidgetStoreLive = Layer.effect(
  WidgetStore,
  Effect.gen(function* () {
    const origin = yield* Config.String("WIDGET_ORIGIN").pipe(
      Config.withDefault("https://widgets.avenire.space"),
    );
    const secret = yield* Config.Redacted("WIDGET_SIGNING_SECRET");
    const ancestors = yield* Config.String("APP_ORIGINS").pipe(
      Config.withDefault("https://avenire.space"),
    );
    return yield* makeWidgetStore({
      origin: origin.replace(/\/$/, ""),
      secret,
      frameAncestors: ancestors
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    });
  }),
);
