import {
  AssetId,
  MAX_WIDGET_HTML_BYTES,
  MAX_WIDGET_INLINE_HTML_BYTES,
  ThreadId,
} from "@avenire/contracts";
import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";
import { WIDGET_RESPONSE_CSP } from "@avenire/ui/widget-protocol";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { ctx, testCrypto } from "../tools/test-support.ts";
import { AssetStore } from "./assets.ts";
import { AssetStoreTest } from "./asset-test-support.ts";
import {
  makeWidgetStore,
  resolveWidgetSource,
  signWidgetToken,
  verifyWidgetToken,
  wrapWidget,
  WIDGET_TOKEN_LIFETIME_MS,
} from "./widgets.ts";
const settings = {
  origin: "https://widgets.test",
  secret: Redacted.make("widget-secret"),
  frameAncestors: ["https://app.test"],
};

it.effect(
  "stores and loads a built widget larger than 2 MiB",
  () =>
    Effect.gen(function* () {
      const html = "<main>Large figure</main><!--" + "x".repeat(2 * 1024 * 1024) + "-->";
      const widgets = yield* makeWidgetStore(settings);
      const result = yield* widgets.render(ctx, { title: "Large figure", html });
      const assets = yield* AssetStore;
      const entry = yield* assets.get(result.assetId);
      expect(Option.isSome(entry)).toBe(true);
      if (Option.isNone(entry)) return;
      const bytes = yield* widgets.load((yield* widgets.url(entry.value)).split("/w/")[1]!);
      expect(bytes.byteLength).toBeGreaterThan(2 * 1024 * 1024);
      expect(new TextDecoder().decode(bytes)).toContain(html);
    }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);
for (const appearance of ["light", "dark"] as const)
  it.effect(`wraps ${appearance} with kits CSP, bootstrap and tokens`, () =>
    Effect.gen(function* () {
      const document = yield* wrapWidget(
        ctx,
        { html: "<main>Figure</main>", title: "Figure" },
        settings.origin,
        appearance,
      );
      expect(document).toContain(`color-scheme:${appearance}`);
      for (const [key, value] of Object.entries(WIDGET_THEME_TOKENS[appearance]))
        expect(document).toContain(`${key}:${value};`);
      expect(document).toContain("https://widgets.test/kits/");
      expect(document).toContain("connect-src &#39;none&#39;");
      expect(document).toContain("avenire:widget:height");
      expect(
        WIDGET_RESPONSE_CSP({
          kitsOrigin: settings.origin,
          frameAncestors: settings.frameAncestors,
        }),
      ).toContain("https://widgets.test/kits/");
    }),
  );
it.effect(
  "renders a permanent private widget asset; short URLs expire without expiring stored bytes",
  () =>
    Effect.gen(function* () {
      const widgets = yield* makeWidgetStore(settings);
      const result = yield* widgets.render(ctx, { title: "Chart", html: "<main>Chart</main>" });
      const assets = yield* AssetStore;
      const entry = yield* assets.get(result.assetId);
      expect(Option.isSome(entry)).toBe(true);
      if (Option.isNone(entry)) return;
      expect(entry.value).toMatchObject({ kind: "widget", visibility: "private" });
      expect(result.url).toContain("/a/");
      const token = (yield* widgets.url(entry.value)).split("/w/")[1]!;
      const bytes = yield* widgets.load(token);
      expect(new TextDecoder().decode(bytes)).toContain("Chart");
      yield* TestClock.adjust("10 minutes");
      expect(yield* widgets.load(token).pipe(Effect.result)).toMatchObject({
        failure: { _tag: "ObjectNotFound" },
      });
      expect(yield* assets.load(entry.value)).toEqual(bytes);
    }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);
it.effect("loads stored widgets using the current kit host without changing stored bytes", () =>
  Effect.gen(function* () {
    const previous = yield* makeWidgetStore({
      ...settings,
      origin: "http://widgets.localhost:3000",
    });
    const result = yield* previous.render(ctx, {
      title: "Existing chart",
      html: '<script type="module" src="http://widgets.localhost:3000/kits/math.js"></script><p>Chart</p>',
    });
    const assets = yield* AssetStore;
    const entry = yield* assets.get(result.assetId);
    if (Option.isNone(entry)) return;
    const original = yield* assets.load(entry.value);
    const current = yield* makeWidgetStore({ ...settings, origin: "http://127.0.0.1:3100" });
    const token = (yield* current.url(entry.value)).split("/w/")[1]!;
    const loaded = new TextDecoder().decode(yield* current.load(token));
    expect(loaded).toContain('src="http://127.0.0.1:3100/kits/math.js"');
    expect(loaded).toContain("script-src &#39;unsafe-inline&#39; http://127.0.0.1:3100/kits/");
    expect(loaded).not.toContain("widgets.localhost");
    expect(yield* assets.load(entry.value)).toEqual(original);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);
it("short tokens reject tampering, expiry and excessive lifetime", () => {
  const id = AssetId.make("widget");
  const token = signWidgetToken(id, WIDGET_TOKEN_LIFETIME_MS, "secret");
  expect(verifyWidgetToken(token, 0, "secret")).toEqual(Option.some(id));
  for (const bad of [
    "",
    `${token}.extra`,
    signWidgetToken(id, WIDGET_TOKEN_LIFETIME_MS + 1, "secret"),
    signWidgetToken(id, 10, "wrong"),
  ])
    expect(Option.isNone(verifyWidgetToken(bad, 0, "secret"))).toBe(true);
  expect(Option.isNone(verifyWidgetToken(token, WIDGET_TOKEN_LIFETIME_MS, "secret"))).toBe(true);
});
it.effect("rejects oversize UTF-8 before storing", () =>
  Effect.gen(function* () {
    const widgets = yield* makeWidgetStore(settings);
    expect(
      yield* widgets
        .render(ctx, { title: "Too big", html: "😀".repeat(MAX_WIDGET_HTML_BYTES / 4 + 1) })
        .pipe(Effect.result),
    ).toMatchObject({ failure: { code: "invalid_input" } });
    expect(yield* (yield* AssetStore).list(ctx.userId)).toEqual([]);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provideService(Crypto.Crypto, testCrypto)),
);

it.effect(
  "resolves large built HTML using only the owning thread, enforces inline size and UTF-8",
  () => {
    const calls: unknown[] = [];
    let bytes = new TextEncoder().encode(
      "<main>" + "x".repeat(MAX_WIDGET_INLINE_HTML_BYTES) + "</main>",
    );
    const service = ChatSandboxes.of({
      target: () => Effect.die("unexpected"),
      exec: () => Effect.die("unexpected"),
      write: () => Effect.die("unexpected"),
      read: () => Effect.die("unexpected"),
      close: () => Effect.die("unexpected"),
      sweep: Effect.succeed(0),
      readArtifact: (owner, input) =>
        Effect.sync(() => {
          calls.push({ owner, input });
          return { path: input.path, name: "figure.html", bytes };
        }),
    });
    return Effect.gen(function* () {
      const turn = { ...ctx, threadId: ThreadId.make("figure-thread") };
      expect(yield* resolveWidgetSource(turn, { path: "figure.html" })).toContain("<main>");
      expect(calls).toEqual([
        {
          owner: { userId: ctx.userId, threadId: turn.threadId },
          input: { path: "figure.html", maxBytes: MAX_WIDGET_HTML_BYTES },
        },
      ]);
      expect(
        yield* resolveWidgetSource(turn, {
          html: "x".repeat(MAX_WIDGET_INLINE_HTML_BYTES + 1),
        }).pipe(Effect.result),
      ).toMatchObject({ failure: { code: "invalid_input" } });
      expect(
        yield* resolveWidgetSource(ctx, { path: "figure.html" }).pipe(Effect.result),
      ).toMatchObject({ failure: { code: "invalid_input" } });
      expect(
        yield* resolveWidgetSource(turn, { path: "figure.png" }).pipe(Effect.result),
      ).toMatchObject({ failure: { code: "invalid_input" } });
      bytes = new Uint8Array([0xff]);
      expect(
        yield* resolveWidgetSource(turn, { path: "figure.html" }).pipe(Effect.result),
      ).toMatchObject({ failure: { code: "invalid_input" } });
    }).pipe(Effect.provideService(ChatSandboxes, service));
  },
);
