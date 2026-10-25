import { AuthService } from "@avenire/auth/server";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthServicesLive } from "~/server/authRuntime";
import { AuthForm } from "./AuthForm";
import type { AuthMode } from "./auth-utils";

const runtime = ManagedRuntime.make(AuthServicesLive);
export async function AuthPage({ mode }: { mode: AuthMode }) {
  const requestHeaders = await headers();
  // Verification has its own success screen after Better Auth creates the session.
  if (mode !== "verify-email") {
    const session = await runtime.runPromise(
      Effect.flatMap(AuthService, (service) => service.getSession(requestHeaders)),
    );
    if (session) redirect("/");
  }
  const google = await runtime.runPromise(
    Effect.map(AuthService, (service) => Boolean(service.auth.options.socialProviders?.google)),
  );
  return <AuthForm key={mode} mode={mode} googleEnabled={google} />;
}
