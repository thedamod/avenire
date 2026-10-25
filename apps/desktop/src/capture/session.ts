import type { AvenireUploadFetch } from "./source-acquisition.ts";

/** Freeze the current Avenire session so an account switch cannot retarget an upload. */
export async function captureUploadSession(
  session: Pick<Electron.Session, "cookies" | "fetch">,
  appUrl: string,
  userId: string,
): Promise<AvenireUploadFetch> {
  const cookie = (await session.cookies.get({ url: appUrl }))
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");
  if (!cookie) throw new Error("Sign in before capturing a source.");
  const fetch: AvenireUploadFetch = (url, init) => {
    if (new URL(url).origin !== new URL(appUrl).origin)
      throw new Error("Capture upload must target Avenire.");
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    headers.set("origin", appUrl);
    return session.fetch(url, { ...init, headers, credentials: "omit", redirect: "error" });
  };
  const response = await fetch(new URL("/api/auth/get-session", appUrl).href, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Could not confirm your sign-in. Try capturing again.");
  const value = (await response.json()) as { user?: { id?: unknown } } | null;
  if (value?.user?.id !== userId)
    throw new Error("Your account changed. Open Avenire before capturing again.");
  return fetch;
}
