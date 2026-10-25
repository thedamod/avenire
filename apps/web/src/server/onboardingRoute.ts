import { AuthService } from "@avenire/auth/server";
import { Database, DatabaseLive } from "@avenire/database/client";
import { user } from "@avenire/database/schema";
import { eq } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthServicesLive } from "./authRuntime";
import { onboardingRedirect } from "./onboarding";

const runtime = ManagedRuntime.make(Layer.merge(AuthServicesLive, DatabaseLive));

export async function requireOnboardingRoute(route: "app" | "onboarding") {
  const requestHeaders = await headers();
  const profile = await runtime.runPromise(
    Effect.gen(function* () {
      const session = yield* (yield* AuthService).getSession(requestHeaders);
      if (!session) return null;
      const [profile] = yield* (yield* Database).use((db) =>
        db
          .select({ onboardingCompletedAt: user.onboardingCompletedAt })
          .from(user)
          .where(eq(user.id, session.id)),
      );
      return profile ?? null;
    }),
  );
  const target = onboardingRedirect(route, profile);
  if (target) redirect(target);
}
