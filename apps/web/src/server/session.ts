import { authenticate } from "@avenire/auth/middleware";
import { parseOrigins } from "@avenire/auth/server";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpRequestError } from "./http.ts";

export const requireUser = Effect.fn("Session.requireUser")(function* (request: Request) {
  const session = yield* authenticate(request.headers).pipe(
    Effect.catchTag("Unauthorized", () =>
      Effect.fail(new HttpRequestError({ status: 401, message: "Sign in to continue." })),
    ),
  );
  return session.id;
});

export const ExtensionIds = Config.schema(
  Schema.String.check(Schema.isPattern(/^\s*(?:[a-p]{32}\s*(?:,\s*[a-p]{32}\s*)*)?$/)),
  "AVENIRE_EXTENSION_IDS",
).pipe(
  Config.withDefault(""),
  Config.map((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  ),
);

export const isExtensionCaptureEndpoint = (request: Request) => {
  const path = new URL(request.url).pathname;
  return (
    (request.method === "POST" &&
      ["/api/library/captures", "/api/library/uploads"].includes(path)) ||
    (["POST", "PUT", "DELETE"].includes(request.method) &&
      /^\/api\/library\/uploads\/[^/]+$/.test(path))
  );
};

const MutationOrigins = Config.all({
  baseURL: Config.String("BETTER_AUTH_URL"),
  additional: Config.String("AUTH_TRUSTED_ORIGINS").pipe(Config.withDefault("")),
});

/** Pairing is a sensitive read and applies the same origin policy as capture mutations. */
export const assertCapturePairingOrigin = (request: Request) => assertRequestOrigin(request, true);

const assertRequestOrigin = Effect.fn("Session.assertRequestOrigin")(function* (
  request: Request,
  pairing = false,
) {
  const config = yield* MutationOrigins;
  const origin = request.headers.get("origin");
  if (origin !== null && (pairing || isExtensionCaptureEndpoint(request))) {
    const ids = yield* ExtensionIds;
    if (ids.some((id) => origin === `chrome-extension://${id}`)) return;
  }
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

/** Protect cookie-authenticated mutations; native clients send their cookie explicitly. */
export const assertMutationOrigin = (
  request: Request,
): Effect.Effect<void, Config.ConfigError | HttpRequestError> =>
  ["GET", "HEAD", "OPTIONS"].includes(request.method) ? Effect.void : assertRequestOrigin(request);

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
