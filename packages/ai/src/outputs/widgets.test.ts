import { AssetId, MAX_WIDGET_HTML_BYTES } from "@avenire/contracts";
import { THEME_TOKENS, WIDGET_TOKEN_SHEET } from "@avenire/ui/tokens";
import { WIDGET_RESPONSE_CSP } from "@avenire/ui/widget-protocol";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { ctx, testCrypto } from "../tools/test-support.ts";
import { renderWidgetSpec } from "../tools/specs.ts";
import { AssetStore } from "./assets.ts";
import { AssetStoreTest } from "./asset-test-support.ts";
import {
  makeWidgetStore,
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
      for (const [key, value] of Object.entries(THEME_TOKENS[appearance]))
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
it("advertises drawing tokens and the real preview tool", () => {
  expect(renderWidgetSpec.description).toContain(WIDGET_TOKEN_SHEET);
  expect(renderWidgetSpec.description).toContain("preview_widget");
});
