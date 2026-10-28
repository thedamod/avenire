import { isMediaApp } from "../../src/capture/app-catalog.ts";
import { mergeSessionsAndFiles } from "../../src/capture/background-merge.ts";
import type { BackgroundMediaItem } from "../../src/capture/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listProcesses,
  type CaptureContext,
} from "./capture-context.ts";

// macOS comm names (ps output) for media apps. No system-wide now-playing
// API exists, so titles come from recovered file basenames — except Music,
// which answers AppleScript for its current track. isMediaApp widens the net
// to the catalog so a player added there is covered without touching this.
const MEDIA_COMM =
  /^(VLC|QuickTimePlayer|Music|mpv|IINA|MPlayer|mpv-bundle|PotPlayer|Elmedia|5KPlayer)$/i;

// macOS: processes holding media/doc files get lsof-scanned (cap 3).
// Titles are file basenames; no playback state is knowable here.
export async function getBackgroundMediaMac(
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundMediaItem[]> {
  const procs = await listProcesses(ctx); // shared `ps`; notes its own failure
  if (!procs.length) {
    notes.push("mac:bgmedia:ps-fail");
    return [];
  }
  const targets = procs.filter(({ name }) => MEDIA_COMM.test(name) || isMediaApp(name)).slice(0, 3);
  const { scanMacProcess } = await import("./document-path-mac.ts");
  let musicTitle: string | undefined;
  if (targets.some((t) => t.name === "Music")) {
    try {
      const { getNowPlayingMac } = await import("./now-playing-mac.ts");
      musicTitle = await getNowPlayingMac(ctx);
    } catch {
      musicTitle = undefined;
    }
  }
  const files: { appName: string; path: string }[] = [];
  await Promise.all(
    targets.map(async ({ pid, name }) => {
      try {
        const hit = await scanMacProcess(pid, notes, ctx);
        if (hit) files.push({ appName: name, path: hit });
      } catch {
        // per-process failure degrades silently
      }
    }),
  );
  const sessions = musicTitle ? [{ appName: "Music", title: musicTitle, status: "Playing" }] : [];
  notes.push(`mac:bgmedia:procs=${targets.length}:files=${files.length}`);
  return mergeSessionsAndFiles(sessions, files);
}
