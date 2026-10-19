import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { attachmentDisposition, MAX_REQUEST_BYTES, readJsonBody } from "./http.ts";
import { widgetHostDecision } from "./widgetHost.ts";

it.effect("reads JSON and rejects malformed or missing bodies", () =>
  Effect.gen(function* () {
    expect(
      yield* readJsonBody(
        new Request("https://app.test/api", { method: "POST", body: '{"path":"file"}' }),
      ),
    ).toEqual({ path: "file" });
    for (const request of [
      new Request("https://app.test/api", { method: "POST" }),
      new Request("https://app.test/api", { method: "POST", body: "{" }),
    ])
      expect(yield* readJsonBody(request).pipe(Effect.result)).toMatchObject({
        failure: { status: 400 },
      });
  }),
);
it.effect("enforces the body limit with and without Content-Length", () =>
  Effect.gen(function* () {
    const body = JSON.stringify({ content: "a".repeat(MAX_REQUEST_BYTES) });
    for (const headers of [{}, { "Content-Length": String(body.length) }]) {
      const request = new Request("https://app.test/api", { method: "POST", body, headers });
      expect(yield* readJsonBody(request).pipe(Effect.result)).toMatchObject({
        failure: { status: 413 },
      });
    }
    const accepted = JSON.stringify("a".repeat(MAX_REQUEST_BYTES - 2));
    const result = yield* readJsonBody(
      new Request("https://app.test/api", { method: "POST", body: accepted }),
    );
    expect(typeof result === "string" ? result.length : 0).toBe(MAX_REQUEST_BYTES - 2);
  }),
);
it("keeps widget documents off the app host and all other routes off the widget host", () => {
  expect(widgetHostDecision("widgets.localhost:3000", "/w/token", "widgets.localhost:3000")).toBe(
    "widget",
  );
  expect(widgetHostDecision("WIDGETS.LOCALHOST:3000", "/w/token", "widgets.localhost:3000")).toBe(
    "widget",
  );
  for (const path of [
    "/",
    "/api/ruth/chat",
    "/api/ruth/artifacts/token",
    "/_next/static/asset.js",
    "/sign-in",
    "/w",
    "/kits/x.js",
  ])
    expect(widgetHostDecision("widgets.localhost:3000", path, "widgets.localhost:3000")).toBe(
      "reject",
    );
  expect(widgetHostDecision("localhost:3000", "/w/token", "widgets.localhost:3000")).toBe("reject");
  expect(widgetHostDecision("widgets.localhost:4000", "/w/token", "widgets.localhost:3000")).toBe(
    "reject",
  );
  expect(widgetHostDecision("localhost:3000", "/api/ruth/chat", "widgets.localhost:3000")).toBe(
    "app",
  );
});
it("escapes download filenames while preserving a UTF-8 name", () => {
  const disposition = attachmentDisposition('café"\r\n.svg');
  expect(disposition).not.toMatch(/[\r\n]/);
  expect(disposition).toContain('filename="caf____.svg"');
  expect(disposition).toContain("filename*=UTF-8''caf%C3%A9%22%0D%0A.svg");
});
