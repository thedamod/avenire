import type { BackgroundMediaItem } from "../../src/capture/types.ts";
import { createCaptureContext, type CaptureContext } from "./capture-context.ts";

// Platform dispatcher: media playing or paused in BACKGROUND apps.
// Paused counts — notes in front + lecture behind is one study circle.
// Never throws: failures yield [] (no background media known).
export async function getBackgroundMedia(
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundMediaItem[]> {
  try {
    if (process.platform === "win32") {
      const { getBackgroundMediaWindows } = await import("./background-media-win.ts");
      return await getBackgroundMediaWindows(notes, ctx);
    }
    if (process.platform === "darwin") {
      const { getBackgroundMediaMac } = await import("./background-media-mac.ts");
      return await getBackgroundMediaMac(notes, ctx);
    }
    if (process.platform === "linux") {
      const { getBackgroundMediaLinux } = await import("./background-media-linux.ts");
      return await getBackgroundMediaLinux(notes, ctx);
    }
  } catch {
    // intentional fallthrough to []
  }
  return [];
}
