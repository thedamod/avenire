import { ScreenSharingPermission, ScreenSharingPermissionPath } from "@avenire/contracts";
import * as Schema from "effect/Schema";

/** Live authenticated session only: no model-supplied consent, cached grant or frozen cookies. */
export async function screenSharingPermission(
  session: Pick<Electron.Session, "fetch">,
  appUrl: string,
  owner: string | undefined,
): Promise<ScreenSharingPermission> {
  if (!owner) throw new Error("Sign in before sharing your screen.");
  const response = await session.fetch(new URL(ScreenSharingPermissionPath, appUrl).href, {
    credentials: "include",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Could not verify screen-sharing permission.");
  const permission = Schema.decodeUnknownSync(ScreenSharingPermission)(await response.json());
  if (permission.userId !== owner || !permission.sessionId)
    throw new Error("Your account changed. Reopen the prompt.");
  return permission;
}
