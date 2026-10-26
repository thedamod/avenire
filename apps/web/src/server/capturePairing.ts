import { CurrentUser, type UserId } from "@avenire/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { createHmac } from "node:crypto";
import { domainResponse } from "./domainHttp.ts";
import { HttpRequestError } from "./http.ts";
import { assertCapturePairingOrigin } from "./session.ts";
import { WidgetHost, widgetHostDecision } from "./widgetHost.ts";

const PairingSecret = Config.option(Config.Redacted("CAPTURE_PAIRING_SECRET")).pipe(
  Config.flatMap((secret) =>
    Option.isSome(secret) ? Config.succeed(secret.value) : Config.Redacted("BETTER_AUTH_SECRET"),
  ),
);

/** Stable per owner, domain-separated from all other uses of the auth secret. */
export const capturePairingToken = Effect.fn("Capture.pairingToken")(function* (userId: UserId) {
  const secret = yield* PairingSecret;
  return yield* Effect.try({
    try: () =>
      createHmac("sha256", Redacted.value(secret))
        .update(`capture-pairing:v1:${userId}`)
        .digest("base64url"),
    catch: () => new HttpRequestError({ status: 500, message: "Capture pairing is unavailable." }),
  });
});

export const capturePairingResponse = (request: Request) =>
  domainResponse(
    request,
    Effect.gen(function* () {
      const policy = yield* WidgetHost;
      const url = new URL(request.url);
      if (
        widgetHostDecision(request.headers.get("host") ?? url.host, url.pathname, policy.host) !==
        "app"
      )
        return yield* new HttpRequestError({ status: 404, message: "Resource not found." });
      yield* assertCapturePairingOrigin(request);
      const userId = (yield* CurrentUser).id;
      return { token: yield* capturePairingToken(userId) };
    }),
  );
