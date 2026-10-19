import { Authenticated, CurrentUser, Unauthorized } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import { AuthService } from "./server.ts";

/** Cookie presence is a UI hint; only Better Auth's session resolution authorizes a request. */
export const authenticate = Effect.fn("Authentication.authenticate")(function* (headers: Headers) {
  const auth = yield* AuthService;
  const user = yield* auth.getSession(headers);
  if (user === null) return yield* new Unauthorized({});
  return user;
});

/**
 * HTTP RPC authorization uses transport headers. RPC message headers are client-controlled
 * metadata and must never replace the Cookie or Authorization headers of the HTTP request.
 */
export const AuthenticationLive = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return Authenticated.of((effect) =>
      Effect.gen(function* () {
        const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
        if (Option.isNone(request)) return yield* new Unauthorized({});
        const user = yield* authenticate(new Headers(request.value.headers)).pipe(
          Effect.provideService(AuthService, auth),
          Effect.catchTag("AuthError", (error) =>
            Effect.logError("RPC session resolution failed", error).pipe(
              Effect.andThen(Effect.fail(new Unauthorized({}))),
            ),
          ),
        );
        return yield* Effect.provideService(effect, CurrentUser, user);
      }),
    );
  }),
);
