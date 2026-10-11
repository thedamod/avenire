import {
  MAX_WIDGET_HTML_BYTES,
  StorageKey,
  UserId,
  WidgetId,
  type Widget,
} from "@avenire/contracts";
import { newId } from "@avenire/shared/id";
import { userPrefix } from "@avenire/storage/keys";
import { ObjectNotFound, Storage, type StorageError } from "@avenire/storage/storage";
import { THEME_TOKENS } from "@avenire/ui/tokens";
import { buildWidgetDocument } from "@avenire/ui/widget-protocol";
import { createHmac, timingSafeEqual } from "node:crypto";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import * as Redacted from "effect/Redacted";

import { type AgentContext, RuthToolError } from "../tools/core.ts";

/** Widgets are permanent objects outside the indexed file namespace. */
export const widgetKey = (userId: UserId, widgetId: WidgetId): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}.avenire/widgets/${encodeURIComponent(widgetId)}.html`);
export interface ResolvedWidget {
  readonly userId: UserId;
  readonly widgetId: WidgetId;
  readonly key: StorageKey;
}
export class WidgetStore extends Context.Service<
  WidgetStore,
  {
    readonly frameAncestors: ReadonlyArray<string>;
    readonly render: (
      ctx: AgentContext,
      input: { readonly title: string; readonly html: string },
    ) => Effect.Effect<
      Widget,
      RuthToolError | StorageError | PlatformError.PlatformError,
      Crypto.Crypto
    >;
    readonly resolve: (token: string) => Effect.Effect<Option.Option<ResolvedWidget>>;
    readonly load: (token: string) => Effect.Effect<Uint8Array, ObjectNotFound | StorageError>;
  }
>()("avenire/ai/WidgetStore") {}

/** Injectable settings keep signing/theming tests independent of production config. */
export const makeWidgetStore = Effect.fn("WidgetStore.make")(function* (options: {
  readonly origin: string;
  readonly secret: Redacted.Redacted<string>;
  readonly frameAncestors: ReadonlyArray<string>;
}) {
  const storage = yield* Storage;
  const signature = (userId: string, widgetId: string) =>
    createHmac("sha256", Redacted.value(options.secret)).update(`${userId}:${widgetId}`).digest();
  const resolve = Effect.fn("WidgetStore.resolve")((token: string) =>
    Effect.sync(() => {
      const parts = token.split(".");
      if (parts.length !== 3) return Option.none<ResolvedWidget>();
      const [encodedUser, widget, signed] = parts as [string, string, string];
      if (!/^[\w-]+$/.test(encodedUser) || !/^[\w-]+$/.test(widget) || !/^[\w-]+$/.test(signed))
        return Option.none<ResolvedWidget>();
      const userBytes = Buffer.from(encodedUser, "base64url");
      const user = userBytes.toString("utf8");
      // Reject noncanonical encodings rather than allowing several URLs for one signature.
      if (!user || Buffer.from(user, "utf8").toString("base64url") !== encodedUser)
        return Option.none<ResolvedWidget>();
      const supplied = Buffer.from(signed, "base64url");
      const expected = signature(user, widget);
      if (
        supplied.toString("base64url") !== signed ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return Option.none<ResolvedWidget>();
      const userId = UserId.make(user);
      const widgetId = WidgetId.make(widget);
      return Option.some({ userId, widgetId, key: widgetKey(userId, widgetId) });
    }),
  );
  return WidgetStore.of({
    frameAncestors: options.frameAncestors,
    resolve,
    load: Effect.fn("WidgetStore.load")(function* (token) {
      const resolved = yield* resolve(token);
      if (Option.isNone(resolved)) return yield* new ObjectNotFound({ key: "widget" });
      return yield* storage.get(resolved.value.key);
    }),
    render: Effect.fn("WidgetStore.render")(function* (ctx, input) {
      if (new TextEncoder().encode(input.html).byteLength > MAX_WIDGET_HTML_BYTES) {
        return yield* new RuthToolError({
          tool: "render_widget",
          code: "invalid_input",
          message: `Widget HTML must be at most ${MAX_WIDGET_HTML_BYTES} bytes.`,
          recoverable: true,
        });
      }
      const widgetId = yield* newId(WidgetId);
      const document = yield* Effect.sync(() =>
        buildWidgetDocument({
          html: input.html,
          title: input.title,
          colorScheme: ctx.page?.colorScheme ?? "light",
          tokens: ctx.page?.themeTokens ?? THEME_TOKENS.light,
        }),
      );
      yield* storage.put(widgetKey(ctx.userId, widgetId), new TextEncoder().encode(document), {
        contentType: "text/html",
      });
      const token = yield* Effect.sync(
        () =>
          `${Buffer.from(ctx.userId).toString("base64url")}.${widgetId}.${signature(ctx.userId, widgetId).toString("base64url")}`,
      );
      return {
        widgetId,
        url: `${options.origin.replace(/\/$/, "")}/w/${token}`,
        title: input.title,
      };
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
    const origins = yield* Config.String("APP_ORIGINS").pipe(
      Config.withDefault("https://avenire.space"),
    );
    return yield* makeWidgetStore({
      origin,
      secret,
      frameAncestors: origins
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }),
);
