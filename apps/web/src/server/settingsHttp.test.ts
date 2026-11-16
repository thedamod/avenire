import { AuthService } from "@avenire/auth/server";
import { UserId, ScreenSharingPermissionPath, ScreenSharingPermission } from "@avenire/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ScreenSharing } from "./settings.ts";
import { screenSharingResponse } from "./settingsHttp.ts";

it.effect("permission lookup is authenticated, owner-bound, no-store and read-only", () =>
  Effect.gen(function* () {
    const viewer = {
      id: UserId.make("owner"),
      name: "Owner",
      email: "owner@test",
      sessionId: "session",
    };
    let enabled = false;
    const lookup = () =>
      screenSharingResponse(new Request(`https://app.test${ScreenSharingPermissionPath}`)).pipe(
        Effect.provideService(AuthService, {
          getSession: () => Effect.succeed(viewer),
        } as unknown as AuthService["Service"]),
        Effect.provideService(ScreenSharing, {
          enabled: (current) => {
            expect(current).toEqual(viewer);
            return Effect.succeed(enabled);
          },
        }),
      );
    for (const value of [false, true, false]) {
      enabled = value;
      const response = yield* lookup();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const json = yield* Effect.promise(() => response.json());
      expect(Schema.decodeUnknownSync(ScreenSharingPermission)(json)).toEqual({
        userId: viewer.id,
        sessionId: "session",
        enabled: value,
      });
    }
    const response = yield* screenSharingResponse(
      new Request(`https://app.test${ScreenSharingPermissionPath}`),
    ).pipe(
      Effect.provideService(AuthService, {
        getSession: () => Effect.succeed(null),
      } as unknown as AuthService["Service"]),
      Effect.provideService(ScreenSharing, {
        enabled: () => Effect.die("Must not read unauthenticated preferences"),
      }),
    );
    expect(response.status).toBe(401);
  }),
);
