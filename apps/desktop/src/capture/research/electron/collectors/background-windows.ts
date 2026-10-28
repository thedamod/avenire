import type { BackgroundWindow } from "../../src/capture/types.ts";
import { createCaptureContext, type CaptureContext } from "./capture-context.ts";

// Platform dispatcher: visible BACKGROUND windows (foreground is captured
// separately). Non-browser only — tabs already cover every browser window.
// Titles always; files only where precisely resolvable (Windows Office docs).
// Media players need no window pass: background-media.ts scans every player
// process, focused or not. Never throws: failures yield [].
export async function getBackgroundWindows(
  fgPid: number | undefined,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundWindow[]> {
  try {
    if (process.platform === "win32") {
      const { getBackgroundWindowsWindows } = await import("./background-windows-win.ts");
      return await getBackgroundWindowsWindows(fgPid, notes, ctx);
    }
    if (process.platform === "darwin") {
      const { getBackgroundWindowsMac } = await import("./background-windows-mac.ts");
      return await getBackgroundWindowsMac(fgPid, notes, ctx);
    }
    if (process.platform === "linux") {
      const { getBackgroundWindowsLinux } = await import("./background-windows-linux.ts");
      return await getBackgroundWindowsLinux(fgPid, notes, ctx);
    }
  } catch {
    notes.push(`${process.platform}:bgwin:enumeration-failed`);
  }
  return ctx.partialWindows ?? [];
}
