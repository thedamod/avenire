import { AuthError, AuthLive, AuthService } from "@avenire/auth/server";
import { DatabaseLive } from "@avenire/database/client";
import { MailerLive } from "@avenire/emailer/mailer";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { boundedRequest } from "./http.ts";
import { WidgetHost, WidgetHostLive, widgetHostDecision } from "./widgetHost.ts";

/** Authentication boots only its database, mailer and host policy, without AI or sandbox credentials. */
export const AuthServicesLive = Layer.mergeAll(
  AuthLive.pipe(Layer.provide(Layer.mergeAll(DatabaseLive, MailerLive))),
  WidgetHostLive,
);

/** Better Auth owns decoding, origin/CSRF checks, callback redirects and Set-Cookie headers. */
export const authResponse = Effect.fn("AuthRoute.respond")(function* (request: Request) {
  const policy = yield* WidgetHost;
  const url = new URL(request.url);
  if (
    widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !== "app"
  )
    return new Response(null, { status: 404 });
  const bounded = yield* boundedRequest(request);
  const auth = yield* AuthService;
  return yield* Effect.tryPromise({
    try: () => auth.auth.handler(bounded),
    catch: (cause) => new AuthError({ cause }),
  });
});

const makeRuntime = () => ManagedRuntime.make(AuthServicesLive);
let runtime: ReturnType<typeof makeRuntime> | undefined;
export const handleAuth = (request: Request): Promise<Response> =>
  (runtime ??= makeRuntime())
    .runPromise(
      authResponse(request).pipe(
        Effect.catchTag("HttpRequestError", (error) =>
          Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
        ),
        Effect.catchCause((cause) =>
          Effect.logError("Authentication request failed", cause).pipe(
            Effect.as(Response.json({ error: "Authentication is unavailable." }, { status: 503 })),
          ),
        ),
      ),
    )
    .catch(() => Response.json({ error: "Authentication is unavailable." }, { status: 503 }));
