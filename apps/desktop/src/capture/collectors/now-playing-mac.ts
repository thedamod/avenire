import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  collectorTimeout,
  createCaptureContext,
  listProcesses,
  type CaptureContext,
} from "./capture-context.ts";

const execFileAsync = promisify(execFile);

// macOS: current track from the Music app (formerly iTunes).
// Other players (VLC, QuickTime, browsers) expose nothing scriptable here,
// so this returns undefined for them. Needs Automation permission for Music.
export async function getNowPlayingMac(
  ctx: CaptureContext = createCaptureContext(),
): Promise<string | undefined> {
  try {
    // `tell application "Music"` LAUNCHES Music if it isn't running — a
    // capture must never open apps. Ask the shared process table first.
    const procs = await listProcesses(ctx);
    if (!procs.some((p) => p.name === "Music")) return undefined;
    return await ctx.memo("nowplaying:mac", async () => {
      const { stdout } = await execFileAsync(
        "osascript",
        [
          "-e",
          'tell application "Music" to if player state is playing then (artist of current track & " - " & name of current track)',
        ],
        { timeout: collectorTimeout(ctx, 5000) },
      );
      const t = stdout.trim().slice(0, 200);
      return t.length > 0 ? t : undefined;
    });
  } catch {
    return undefined;
  }
}
