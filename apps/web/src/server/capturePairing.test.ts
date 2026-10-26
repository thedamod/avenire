import { AuthService } from "@avenire/auth/server";
import { UserId } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { createHmac } from "node:crypto";
import { capturePairingResponse, capturePairingToken } from "./capturePairing.ts";
import { WidgetHost } from "./widgetHost.ts";

const extension = "a".repeat(32);
const config = (extra: Record<string, string> = {}) =>
  ConfigProvider.fromUnknown({
    BETTER_AUTH_URL: "https://app.test",
    BETTER_AUTH_SECRET: "auth-secret",
    AVENIRE_EXTENSION_IDS: extension,
    ...extra,
  });
it.effect("pairing is a stable 43-character base64url HMAC bound to the authenticated owner", () =>
  Effect.gen(function* () {
    const token = yield* capturePairingToken(UserId.make("owner"));
    expect(token).toBe(
      createHmac("sha256", "auth-secret").update("capture-pairing:v1:owner").digest("base64url"),
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(yield* capturePairingToken(UserId.make("owner"))).toBe(token);
    expect(yield* capturePairingToken(UserId.make("other"))).not.toBe(token);
    expect(
      yield* capturePairingToken(UserId.make("owner")).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          config({ CAPTURE_PAIRING_SECRET: "capture-secret" }),
        ),
      ),
    ).toBe(
      createHmac("sha256", "capture-secret").update("capture-pairing:v1:owner").digest("base64url"),
    );
  }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, config())),
);
it.effect("pairing requires a session, enforces origins and returns private no-store JSON", () =>
  Effect.gen(function* () {
    const auth = AuthService.of({
      auth: {} as AuthService["Service"]["auth"],
      getSession: (headers) =>
        Effect.succeed(
          headers.get("cookie") === "session=owner"
            ? { id: UserId.make("owner"), email: "owner@test", name: "Owner" }
            : null,
        ),
    });
    for (const [origin, cookie, status] of [
      [`chrome-extension://${extension}`, "session=owner", 200],
      ["https://app.test", "session=owner", 200],
      ["avenire://", "session=owner", 200],
      ["https://attacker.test", "session=owner", 403],
      [`chrome-extension://${"b".repeat(32)}`, "session=owner", 403],
      [`chrome-extension://${extension}`, "forged", 401],
    ] as const) {
      const response = yield* capturePairingResponse(
        new Request("https://app.test/api/capture/pairing", {
          headers: { origin, cookie },
        }),
      ).pipe(Effect.provideService(AuthService, auth));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store");
      if (status === 200)
        expect(yield* Effect.promise(() => response.json())).toEqual({
          token: yield* capturePairingToken(UserId.make("owner")),
        });
    }
  }).pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, config()),
    Effect.provideService(WidgetHost, { host: "widgets.test" }),
  ),
);
