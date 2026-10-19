import { authenticate } from "@avenire/auth/middleware";
import { parseOrigins } from "@avenire/auth/server";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { HttpRequestError } from "./http.ts";

export const requireUser = Effect.fn("Session.requireUser")(function* (request: Request) {
  const session = yield* authenticate(request.headers).pipe(
    Effect.catchTag("Unauthorized", () =>
      Effect.fail(new HttpRequestError({ status: 401, message: "Sign in to continue." })),
    ),
  );
  return session.id;
});

const MutationOrigins = Config.all({
  baseURL: Config.String("BETTER_AUTH_URL"),
  additional: Config.String("AUTH_TRUSTED_ORIGINS").pipe(Config.withDefault("")),
});

/** Protect cookie-authenticated mutations; native clients send their cookie explicitly. */
export const assertMutationOrigin = Effect.fn("Session.assertMutationOrigin")(function* (
  request: Request,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const config = yield* MutationOrigins;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const fetchSite = request.headers.get("sec-fetch-site");
  const trusted = new Set([
    new URL(config.baseURL).origin,
    "avenire://",
    ...parseOrigins(config.additional),
  ]);
  // Native/server clients have no browser fetch metadata. A browser's cross-site
  // request must carry a trusted origin, even if it omits the Origin header.
  if (origin === null) {
    if (referer !== null) {
      const source = URL.parse(referer);
      if (source !== null && trusted.has(source.origin)) return;
      return yield* new HttpRequestError({
        status: 403,
        message: "This request origin is not allowed.",
      });
    }
    if (fetchSite === null || fetchSite === "same-origin" || fetchSite === "none") return;
  } else {
    if (origin !== "null" && trusted.has(origin)) return;
  }
  return yield* new HttpRequestError({
    status: 403,
    message: "This request origin is not allowed.",
  });
});

/** NDJSON is not a browser simple content type; native clients can omit Origin safely. */
export const assertRpcRequest = (request: Request) =>
  assertMutationOrigin(request).pipe(
    Effect.andThen(() =>
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
      "application/ndjson"
        ? Effect.void
        : Effect.fail(
            new HttpRequestError({
              status: 415,
              message: "Content-Type must be application/ndjson.",
            }),
          ),
    ),
  );
