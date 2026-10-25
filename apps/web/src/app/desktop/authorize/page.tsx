import { AuthService } from "@avenire/auth/server";
import { DesktopAuthTarget } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DesktopAuthorize } from "~/features/desktop/DesktopAuthorize";
import { AuthServicesLive } from "~/server/authRuntime";

export const metadata = {
  title: "Continue in Avenire",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
const runtime = ManagedRuntime.make(AuthServicesLive);

export default async function DesktopAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  const query = await searchParams;
  const decoded = Schema.decodeUnknownOption(DesktopAuthTarget)({
    port: Number(query.port),
    state: query.state,
  });
  if (Option.isNone(decoded))
    return (
      <main className="p-8 text-foreground">
        This desktop sign-in request is invalid. Start again from Avenire.
      </main>
    );
  const requestHeaders = await headers();
  const session = await runtime.runPromise(
    Effect.flatMap(AuthService, (service) => service.getSession(requestHeaders)),
  );
  if (!session) {
    const callback = `/desktop/authorize?${new URLSearchParams({ port: String(decoded.value.port), state: decoded.value.state })}`;
    redirect(`/sign-in?${new URLSearchParams({ callbackURL: callback })}`);
  }
  return <DesktopAuthorize target={decoded.value} email={session.email} />;
}
