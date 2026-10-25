"use server";

import { AuthError, AuthService } from "@avenire/auth/server";
import { DesktopAuthTarget } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schema from "effect/Schema";
import { headers } from "next/headers";
import { AuthServicesLive } from "~/server/authRuntime";

const runtime = ManagedRuntime.make(AuthServicesLive);

/** Next validates the action's Origin; Better Auth requires the current browser session. */
export async function authorizeDesktop(target: DesktopAuthTarget): Promise<{ token: string }> {
  Schema.decodeUnknownSync(DesktopAuthTarget)(target, { onExcessProperty: "error" });
  const requestHeaders = await headers();
  return runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* AuthService;
      return yield* Effect.tryPromise({
        try: () => service.auth.api.generateOneTimeToken({ headers: requestHeaders }),
        catch: (cause) => new AuthError({ cause }),
      });
    }),
  );
}
