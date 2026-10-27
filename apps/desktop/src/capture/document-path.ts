/** Adapted from context/research/background_worker's platform document-path collectors. */
import type { ForegroundApp } from "./research/src/capture/types.ts";
import {
  createCaptureContext,
  type CaptureContext,
} from "./research/electron/collectors/capture-context.ts";
import { isLocalFileApp } from "./research/src/capture/app-catalog.ts";

export async function resolveDocumentPath(
  app: ForegroundApp,
  notes: string[],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  if (!isLocalFileApp(app.appName)) return undefined;
  if (/^obsidian$/i.test(app.appName)) {
    const { resolveObsidianNote } = await import("./research/electron/collectors/obsidian-note.ts");
    return resolveObsidianNote(notes);
  }
  if (process.platform === "linux") {
    const { resolveDocumentPathLinux } =
      await import("./research/electron/collectors/document-path-linux.ts");
    return resolveDocumentPathLinux(app, notes, ctx);
  }
  if (process.platform === "darwin") {
    const { resolveDocumentPathMac } =
      await import("./research/electron/collectors/document-path-mac.ts");
    return resolveDocumentPathMac(app, notes, ctx);
  }
  if (process.platform === "win32") {
    const { resolveDocumentPathWindows } =
      await import("./research/electron/collectors/document-path-win.ts");
    return resolveDocumentPathWindows(app, notes, ctx);
  }
  return undefined;
}
