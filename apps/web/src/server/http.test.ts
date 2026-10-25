import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { attachmentDisposition, MAX_REQUEST_BYTES, readJsonBody } from "./http.ts";
import { widgetHostDecision } from "./widgetHost.ts";

it.effect("reads JSON and rejects malformed or missing bodies", () =>
  Effect.gen(function* () {
    expect(
      yield* readJsonBody(
        new Request("https://app.test/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"path":"file"}',
        }),
      ),
    ).toEqual({ path: "file" });
    for (const request of [
      new Request("https://app.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      new Request("https://app.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
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
      const request = new Request("https://app.test/api", {
        method: "POST",
        body,
        headers: { ...headers, "content-type": "application/json" },
      });
      expect(yield* readJsonBody(request).pipe(Effect.result)).toMatchObject({
        failure: { status: 413 },
      });
    }
    const accepted = JSON.stringify("a".repeat(MAX_REQUEST_BYTES - 2));
    const result = yield* readJsonBody(
      new Request("https://app.test/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: accepted,
      }),
    );
    expect(typeof result === "string" ? result.length : 0).toBe(MAX_REQUEST_BYTES - 2);
  }),
);
it("keeps widget documents off the app host and all other routes off the widget host", () => {
  expect(widgetHostDecision("127.0.0.1:3000", "/w/token", "127.0.0.1:3000")).toBe("widget");
  expect(widgetHostDecision("WIDGETS.TEST", "/w/token", "widgets.test")).toBe("widget");
  for (const path of [
    "/",
    "/api/ruth/chat",
    "/a/token",
    "/_next/static/asset.js",
    "/sign-in",
    "/w",
  ])
    expect(widgetHostDecision("127.0.0.1:3000", path, "127.0.0.1:3000")).toBe("reject");
  expect(widgetHostDecision("localhost:3000", "/w/token", "127.0.0.1:3000")).toBe("reject");
  expect(widgetHostDecision("127.0.0.1:4000", "/w/token", "127.0.0.1:3000")).toBe("reject");
  expect(widgetHostDecision("localhost:3000", "/api/ruth/chat", "127.0.0.1:3000")).toBe("app");
});
it("escapes download filenames while preserving a UTF-8 name", () => {
  const disposition = attachmentDisposition('café"\r\n.svg');
  expect(disposition).not.toMatch(/[\r\n]/);
  expect(disposition).toContain('filename="caf____.svg"');
  expect(disposition).toContain("filename*=UTF-8''caf%C3%A9%22%0D%0A.svg");
});

it.effect(
  "JSON mutations reject browser simple content types while accepting native JSON requests",
  () =>
    Effect.gen(function* () {
      for (const type of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
      ]) {
        expect(
          yield* readJsonBody(
            new Request("https://app.test/api", {
              method: "POST",
              headers: { "content-type": type },
              body: "{}",
            }),
          ).pipe(Effect.result),
        ).toMatchObject({ failure: { status: 415 } });
      }
      expect(
        yield* readJsonBody(
          new Request("https://app.test/api", {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: "{}",
          }),
        ),
      ).toEqual({});
    }),
);

it.effect("bounds opaque auth/RPC bodies and preserves transport headers and cancellation", () =>
  Effect.gen(function* () {
    const { boundedRequest } = yield* Effect.promise(() => import("./http.ts"));
    const controller = new AbortController();
    const request = new Request("https://app.test/api/rpc", {
      method: "POST",
      signal: controller.signal,
      headers: { cookie: "session=verified", "content-type": "application/ndjson" },
      body: '{"_tag":"Request"}\n',
    });
    const bounded = yield* boundedRequest(request);
    expect(bounded.headers.get("cookie")).toBe("session=verified");
    expect(bounded.headers.get("content-type")).toBe("application/ndjson");
    expect(yield* Effect.promise(() => bounded.text())).toBe('{"_tag":"Request"}\n');
    controller.abort();
    expect(bounded.signal.aborted).toBe(true);
    let cancelled = false;
    const oversized = new Request("https://app.test/api/rpc", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(yield* boundedRequest(oversized).pipe(Effect.result)).toMatchObject({
      failure: { status: 413 },
    });
    expect(cancelled).toBe(true);
  }),
);

it.effect(
  "normalizes Next-style proxied POST, GET and HEAD requests into cloneable native requests",
  () =>
    Effect.gen(function* () {
      const { boundedRequest } = yield* Effect.promise(() => import("./http.ts"));
      for (const method of ["POST", "GET", "HEAD"]) {
        const controller = new AbortController();
        const incoming = new Request("https://app.test/api/auth/get-session", {
          method,
          signal: controller.signal,
          headers: { cookie: "session=verified", "content-type": "application/json" },
          ...(method === "POST" ? { body: '{"email":"owner@example.test"}' } : {}),
        });
        const proxied = new Proxy(incoming, {
          get(target, property) {
            return Reflect.get(target, property, target);
          },
        });
        const safe = yield* boundedRequest(proxied);
        expect(safe).not.toBe(proxied);
        expect(safe.url).toBe(incoming.url);
        expect(safe.method).toBe(method);
        expect(safe.headers.get("cookie")).toBe("session=verified");
        expect(safe.headers.get("content-type")).toBe("application/json");
        const cloned = safe.clone();
        expect(yield* Effect.promise(() => cloned.text())).toBe(
          method === "POST" ? '{"email":"owner@example.test"}' : "",
        );
        controller.abort();
        expect(safe.signal.aborted).toBe(true);
        expect(cloned.signal.aborted).toBe(true);
      }
    }),
);
