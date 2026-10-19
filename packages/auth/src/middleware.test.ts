import { Authenticated, CurrentUser, UserId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpHeaders from "effect/http/Headers";
import * as Layer from "effect/Layer";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcMessage from "effect/rpc/RpcMessage";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import * as Schema from "effect/Schema";
import { AuthenticationLive, authenticate } from "./middleware.ts";
import { AuthError, AuthService } from "./server.ts";

const viewer = { id: UserId.make("fixture"), name: "Fixture", email: "fixture@example.test" };
const otherViewer = { ...viewer, id: UserId.make("other-fixture") };
const auth = AuthService.of({
  auth: {} as AuthService["Service"]["auth"],
  getSession: (headers) =>
    headers.get("cookie") === "session=unavailable"
      ? Effect.fail(new AuthError({ cause: "fixture session store failure" }))
      : Effect.succeed(
          headers.get("cookie") === "session=valid"
            ? viewer
            : headers.get("cookie") === "session=other"
              ? otherViewer
              : null,
        ),
});

it.effect("requires a resolved session rather than a cookie hint", () =>
  Effect.gen(function* () {
    expect(yield* authenticate(new Headers({ cookie: "session=valid" }))).toEqual(viewer);
    expect(
      yield* authenticate(new Headers({ cookie: "better-auth.session_token=forged" })).pipe(
        Effect.result,
      ),
    ).toMatchObject({ failure: { _tag: "Unauthorized" } });
    const failed = yield* authenticate(new Headers()).pipe(
      Effect.provideService(AuthService, {
        ...auth,
        getSession: () => Effect.fail(new AuthError({ cause: "database unavailable" })),
      }),
      Effect.result,
    );
    expect(failed).toMatchObject({ failure: { _tag: "AuthError" } });
  }).pipe(Effect.provideService(AuthService, auth)),
);

it.effect(
  "HTTP RPC authorization ignores forged per-message headers and isolates concurrent callers",
  () =>
    Effect.gen(function* () {
      const Rpcs = RpcGroup.make(Rpc.make("test.viewer", { success: Schema.String })).middleware(
        Authenticated,
      );
      const handlers = Rpcs.toLayer({
        "test.viewer": () => Effect.map(CurrentUser, (user) => user.id),
      });
      const routes = RpcServer.layerHttp({ group: Rpcs, path: "/rpc", protocol: "http" }).pipe(
        Layer.provide(handlers),
        Layer.provide(AuthenticationLive),
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(Layer.succeed(AuthService, auth)),
      );
      const server = HttpRouter.toWebHandler(routes, { disableLogger: true });
      const request = (cookie?: string, forged?: string) =>
        new Request("https://app.test/rpc", {
          method: "POST",
          headers: { "content-type": "application/ndjson", ...(cookie ? { cookie } : {}) },
          body: `${JSON.stringify({ _tag: "Request", id: "1", tag: "test.viewer", payload: null, headers: forged ? [["cookie", forged]] : [] })}\n`,
        });
      const responses = yield* Effect.promise(() =>
        Promise.all([
          server.handler(request("session=valid")),
          server.handler(request(undefined, "session=valid")),
          server.handler(request("session=forged", "session=valid")),
          server.handler(request("session=valid", "session=forged")),
          server.handler(request("session=other", "session=valid")),
          server.handler(request("session=unavailable")),
        ]),
      );
      const bodies = yield* Effect.promise(() =>
        Promise.all(responses.map((response) => response.text())),
      );
      expect(bodies[0]).toContain('"value":"fixture"');
      expect(bodies[1]).toContain('"_tag":"Unauthorized"');
      expect(bodies[2]).toContain('"_tag":"Unauthorized"');
      expect(bodies[3]).toContain('"value":"fixture"');
      expect(bodies[4]).toContain('"value":"other-fixture"');
      expect(bodies[5]).toContain('"_tag":"Unauthorized"');
      expect(bodies[5]).not.toContain("fixture session store failure");
      yield* Effect.promise(() => server.dispose());
    }),
);

it.effect("fails closed when RPC middleware runs without an HTTP request", () =>
  Effect.gen(function* () {
    const middleware = yield* Authenticated;
    const result = yield* middleware(Effect.die("handler must not run without transport context"), {
      client: new Rpc.ServerClient(0),
      requestId: RpcMessage.RequestId("1"),
      rpc: Rpc.make("test.viewer"),
      payload: undefined,
      headers: HttpHeaders.fromInput({ cookie: "session=valid" }),
    }).pipe(Effect.result, Effect.scoped);
    expect(result).toMatchObject({ failure: { _tag: "Unauthorized" } });
  }).pipe(Effect.provide(AuthenticationLive), Effect.provideService(AuthService, auth)),
);
