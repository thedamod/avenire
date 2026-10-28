import { isMediaApp } from "../../src/capture/app-catalog.ts";
import type { ForegroundApp } from "../../src/capture/types.ts";
import { createCaptureContext, type CaptureContext } from "./capture-context.ts";

// Only worth asking the OS when the focused app actually plays media.
// Browsers answer SMTC/playerctl too, but their tabs already carry titles.
// (Blocked DRM apps like Spotify never reach here — blocklist runs first.)
// Thin alias kept for document-path-win.ts, snapshot.ts and tests; the regex
// lives in app-catalog.ts. Sibling-process scans are only worthwhile for
// media apps (a second winword.exe holding another doc would misattribute —
// media files are what we chase across instances).
export const isMediaAppName = isMediaApp;

// Platform dispatcher. Returns artist/title as separate fields, else undefined.
export async function getNowPlaying(
  app: ForegroundApp,
  ctx: CaptureContext = createCaptureContext(),
): Promise<{ artist?: string; title: string } | undefined> {
  if (!isMediaApp(app.appName, app.bundleIdOrExe)) return undefined;
  try {
    if (process.platform === "win32") {
      const { getNowPlayingWindows } = await import("./now-playing-win.ts");
      return getNowPlayingWindows(ctx);
    }
    if (process.platform === "darwin") {
      const { getNowPlayingMac } = await import("./now-playing-mac.ts");
      const title = await getNowPlayingMac(ctx);
      return title ? { title } : undefined;
    }
    if (process.platform === "linux") {
      const { getNowPlayingLinux } = await import("./now-playing-linux.ts");
      const title = await getNowPlayingLinux(ctx);
      return title ? { title } : undefined;
    }
  } catch {
    // intentional fallthrough to undefined
  }
  return undefined;
}
