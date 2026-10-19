import { AuthService } from "@avenire/auth/server";
import { UserId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { NextRequest } from "next/server";
import { afterEach, vi } from "vite-plus/test";
import { proxy } from "../proxy.ts";
import { authResponse } from "./authRuntime.ts";
import { assertMutationOrigin, assertRpcRequest, requireUser } from "./session.ts";
import { WidgetHost } from "./widgetHost.ts";
import { GET, POST, runtime } from "../app/api/auth/[...all]/route.ts";
import { handleAuth } from "./authRuntime.ts";

const config = ConfigProvider.fromUnknown({
  BETTER_AUTH_URL: "https://app.test",
  AUTH_TRUSTED_ORIGINS: "https://mobile-web.test",
  WIDGET_ORIGIN: "https://widgets.test",
});
const user = { id: UserId.make("fixture"), email: "fixture@example.test", name: "Fixture" };
const session = AuthService.of({
  auth: {} as AuthService["Service"]["auth"],
  getSession: (headers) => Effect.succeed(headers.get("cookie") === "session=valid" ? user : null),
});
afterEach(() => vi.unstubAllEnvs());

it.effect("HTTP authorization validates the request's exact session headers", () =>
  Effect.gen(function* () {
    expect(
      yield* requireUser(
        new Request("https://app.test/api", { headers: { cookie: "session=valid" } }),
      ),
    ).toBe(user.id);
    expect(
      yield* requireUser(
        new Request("https://app.test/api", {
          headers: { cookie: "better-auth.session_token=forged" },
        }),
      ).pipe(Effect.result),
    ).toMatchObject({ failure: { status: 401 } });
  }).pipe(Effect.provideService(AuthService, session)),
);

it.effect(
  "mutation guards distinguish trusted browser/native origins from cross-site requests",
  () =>
    Effect.gen(function* () {
      for (const headers of [
        { origin: "https://app.test" },
        { origin: "https://mobile-web.test" },
        { origin: "avenire://" },
        {},
        { "sec-fetch-site": "same-origin" },
        { referer: "https://app.test/inbox" },
        { referer: "https://mobile-web.test/inbox" },
      ]) {
        yield* assertMutationOrigin(
          new Request("https://app.test/api", { method: "POST", headers }),
        );
      }
      for (const headers of [
        { origin: "https://attacker.test" },
        { origin: "null" },
        { origin: "avenire://attacker" },
        { "sec-fetch-site": "cross-site" },
        { "sec-fetch-site": "same-site" },
        { referer: "https://attacker.test/form" },
        { referer: "invalid" },
        { origin: "https://attacker.test", referer: "https://app.test/inbox" },
      ]) {
        expect(
          yield* assertMutationOrigin(
            new Request("https://app.test/api", { method: "POST", headers }),
          ).pipe(Effect.result),
        ).toMatchObject({ failure: { status: 403 } });
      }
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);

it.effect("mounts both auth HTTP methods with the shared Node handler", () =>
  Effect.sync(() => {
    expect(GET).toBe(handleAuth);
    expect(POST).toBe(handleAuth);
    expect(runtime).toBe("nodejs");
  }),
);

it.effect(
  "auth transport forwards method, cookies, redirect and Set-Cookie without rewriting",
  () =>
    Effect.gen(function* () {
      const request = new Request("https://app.test/api/auth/callback/google", {
        headers: { cookie: "state=fixture" },
      });
      const response = new Response(null, {
        status: 302,
        headers: {
          location: "avenire://callback",
          "set-cookie": "session=valid; HttpOnly; Secure",
        },
      });
      let received: Request | undefined;
      const auth = {
        ...session,
        auth: {
          handler: async (actual: Request) => {
            received = actual.clone();
            return response;
          },
        } as AuthService["Service"]["auth"],
      };
      expect(
        yield* authResponse(
          new Proxy(request, {
            get(target, property) {
              return Reflect.get(target, property, target);
            },
          }),
        ).pipe(Effect.provideService(AuthService, auth)),
      ).toBe(response);
      expect(received?.url).toBe(request.url);
      expect(received?.method).toBe(request.method);
      expect(received?.headers.get("cookie")).toBe("state=fixture");
      const forbidden = yield* authResponse(
        new Request("https://widgets.test/api/auth/get-session"),
      ).pipe(Effect.provideService(AuthService, auth));
      expect(forbidden.status).toBe(404);
      expect(received?.url).toBe(request.url);
      expect(received?.method).toBe(request.method);
    }).pipe(Effect.provideService(WidgetHost, { host: "widgets.test" })),
);

it.effect(
  "Next16 proxy isolates every widget-host path and keeps sign-in reachable with stale cookies",
  () =>
    Effect.gen(function* () {
      vi.stubEnv("WIDGET_ORIGIN", "https://widgets.test");
      for (const path of [
        "/api/auth/get-session",
        "/api/rpc",
        "/_next/static/chunk.js",
        "/a/token",
        "/sign-in",
      ]) {
        const response = yield* Effect.promise(() =>
          proxy(new NextRequest(`https://widgets.test${path}`)),
        );
        expect(response.status).toBe(404);
      }
      for (const path of ["/sign-in", "/sign-up"]) {
        const response = yield* Effect.promise(() =>
          proxy(
            new NextRequest(`https://app.test${path}`, {
              headers: { cookie: "better-auth.session_token=forged" },
            }),
          ),
        );
        expect(response.headers.get("x-middleware-next")).toBe("1");
      }
      const response = yield* Effect.promise(() =>
        proxy(new NextRequest("https://app.test/inbox")),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://app.test/sign-in");
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);

it.effect(
  "RPC rejects browser simple request bodies and accepts native NDJSON without Origin",
  () =>
    Effect.gen(function* () {
      for (const type of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
      ]) {
        expect(
          yield* assertRpcRequest(
            new Request("https://app.test/api/rpc", {
              method: "POST",
              headers: { "content-type": type },
              body: "{}",
            }),
          ).pipe(Effect.result),
        ).toMatchObject({ failure: { status: 415 } });
      }
      yield* assertRpcRequest(
        new Request("https://app.test/api/rpc", {
          method: "POST",
          headers: { "content-type": "application/ndjson" },
          body: "{}",
        }),
      );
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config)),
);
