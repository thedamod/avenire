import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { kitsResponse } from "./kits.ts";
import { WidgetHost, widgetHostDecision } from "./widgetHost.ts";
it.effect("kit aliases redirect to manifest-hash immutable modules with opaque-origin CORS", () =>
  Effect.gen(function* () {
    const alias = yield* kitsResponse(new Request("https://widgets.test/kits/math.js"), [
      "math.js",
    ]);
    expect(alias.status).toBe(307);
    const location = alias.headers.get("Location")!;
    expect(location).toMatch(/^\/kits\/[a-f0-9]{64}\/math.js$/);
    expect(alias.headers.get("Cache-Control")).toBe("no-cache");
    const response = yield* kitsResponse(
      new Request(`https://widgets.test${location}`, { headers: { Origin: "null" } }),
      location.slice("/kits/".length).split("/"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(response.headers.get("Content-Type")).toContain("text/javascript");
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(yield* Effect.promise(() => response.text())).toContain("doublePendulum");
  }).pipe(Effect.provideService(WidgetHost, { host: "widgets.test" })),
);
it.effect("kits reject app hosts, traversal, unknown names and stale manifest hashes", () =>
  Effect.gen(function* () {
    for (const [url, path] of [
      ["https://app.test/kits/math.js", ["math.js"]],
      ["https://widgets.test/kits/secret", ["../secret"]],
      ["https://widgets.test/kits/unknown", ["unknown"]],
      ["https://widgets.test/kits/bad/math.js", ["bad", "math.js"]],
    ] as const)
      expect((yield* kitsResponse(new Request(url), path)).status).toBe(404);
  }).pipe(Effect.provideService(WidgetHost, { host: "widgets.test" })),
);
it("widget host policy permits only widget documents and kits", () => {
  for (const path of ["/w/token", "/kits/math.js", "/kits/hash/iso.js"]) {
    expect(widgetHostDecision("widgets.test", path, "widgets.test")).toBe("widget");
    expect(widgetHostDecision("app.test", path, "widgets.test")).toBe("reject");
  }
  for (const path of ["/a/token", "/api/rpc", "/_next/static/file", "/"])
    expect(widgetHostDecision("widgets.test", path, "widgets.test")).toBe("reject");
});
