import { MAX_WIDGET_HTML_BYTES, type PageContext } from "@avenire/contracts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { userPrefix } from "@avenire/storage/keys";
import { THEME_TOKENS, THEME_TOKEN_NAMES, WIDGET_TOKEN_SHEET } from "@avenire/ui/tokens";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import { renderWidgetSpec } from "./specs.ts";
import { ctx, testCrypto } from "./test-support.ts";
import { makeWidgetStore, widgetKey, WidgetStore, WidgetStoreLive } from "./widgets.ts";

const settings = {
  origin: "https://widgets.test",
  secret: Redacted.make("test-signing-key"),
  frameAncestors: ["https://app.test"],
};
const page: PageContext = {
  surface: "chat",
  platform: "web",
  contentWidthPx: 800,
  colorScheme: "dark",
  themeTokens: { ...THEME_TOKENS.dark, "--background": "#101010", "--chart-1": "#ff00ff" },
  fonts: { body: "sans-serif", mono: "monospace" },
};
for (const dark of [true, false])
  it.effect(`stores ${dark ? "page dark" : "default light"} tokens, bootstrap and CSP`, () =>
    Effect.gen(function* () {
      const store = yield* makeWidgetStore(settings);
      const widget = yield* store.render(
        { ...ctx, ...(dark ? { page } : {}) },
        { title: "Chart", html: "<main><h1>Chart</h1></main>" },
      );
      const storage = yield* Storage;
      const bytes = yield* storage.get(widgetKey(ctx.userId, widget.widgetId));
      const document = new TextDecoder().decode(bytes);
      expect(document).toContain(`color-scheme:${dark ? "dark" : "light"}`);
      for (const [key, value] of Object.entries(dark ? page.themeTokens : THEME_TOKENS.light))
        expect(document).toContain(`${key}:${value};`);
      expect(document).toContain("avenire:theme");
      expect(document).toContain("avenire:widget:height");
      expect(document).toContain('http-equiv="Content-Security-Policy"');
      expect(document).toContain("connect-src &#39;none&#39;");
      expect((yield* storage.head(widgetKey(ctx.userId, widget.widgetId))).contentType).toBe(
        "text/html",
      );
      const token = widget.url.split("/w/")[1]!;
      expect(yield* store.resolve(token)).toEqual(
        Option.some({
          userId: ctx.userId,
          widgetId: widget.widgetId,
          key: widgetKey(ctx.userId, widget.widgetId),
        }),
      );
      expect(yield* store.load(token)).toEqual(bytes);
      const [user, id, signature] = token.split(".");
      for (const bad of [
        `${user}.${id}.AAAA`,
        `${Buffer.from("other").toString("base64url")}.${id}.${signature}`,
        `${user}.other.${signature}`,
        `${token}.extra`,
        "",
        `../${token}`,
      ])
        expect(Option.isNone(yield* store.resolve(bad))).toBe(true);
      expect(yield* store.load("invalid").pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "ObjectNotFound" },
      });
    }).pipe(Effect.provide(StorageMemory), Effect.provideService(Crypto.Crypto, testCrypto)),
  );
it.effect("rejects oversize UTF-8 before storing anything", () =>
  Effect.gen(function* () {
    const store = yield* makeWidgetStore(settings);
    const result = yield* store
      .render(ctx, { title: "Too big", html: "😀".repeat(MAX_WIDGET_HTML_BYTES / 4 + 1) })
      .pipe(Effect.result);
    expect(result).toMatchObject({ failure: { code: "invalid_input" } });
    const storage = yield* Storage;
    expect(yield* storage.list(userPrefix(ctx.userId))).toEqual([]);
  }).pipe(Effect.provide(StorageMemory), Effect.provideService(Crypto.Crypto, testCrypto)),
);
it("includes the entire token sheet and every token group", () => {
  expect(renderWidgetSpec.description).toContain(WIDGET_TOKEN_SHEET);
  for (const name of THEME_TOKEN_NAMES) expect(renderWidgetSpec.description).toContain(name);
});
it.effect("reads origins and redacted secret in the layer", () =>
  Effect.gen(function* () {
    const store = yield* WidgetStore;
    expect(store.frameAncestors).toEqual(["https://one.test", "https://two.test"]);
  }).pipe(
    Effect.provide(WidgetStoreLive),
    Effect.provide(StorageMemory),
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({
          WIDGET_SIGNING_SECRET: "test",
          APP_ORIGINS: "https://one.test, https://two.test",
        }),
      ),
    ),
  ),
);
