/** Adapted from context/research/background_worker's platform document-path collectors. */
import { existsSync } from "node:fs";
import type { ForegroundApp } from "./research/src/capture/types.ts";
import { createCaptureContext } from "./research/electron/collectors/capture-context.ts";
import { isLocalFileApp } from "./research/src/capture/app-catalog.ts";

export async function resolveDocumentPath(
  app: ForegroundApp,
  notes: string[],
): Promise<string | undefined> {
  if (!isLocalFileApp(app.appName)) return undefined;
  if (/^obsidian$/i.test(app.appName)) {
    const { resolveObsidianNote } = await import("./research/electron/collectors/obsidian-note.ts");
    return resolveObsidianNote(notes);
  }
  const ctx = createCaptureContext(notes);
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
    const { execPowerShell } = await import("./research/electron/collectors/ps-queue.ts");
    const office: Record<string, string> = {
      winword:
        "[Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application').ActiveDocument.FullName",
      excel:
        "[Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application').ActiveWorkbook.FullName",
      powerpnt:
        "[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application').ActivePresentation.FullName",
    };
    const script = office[app.appName.toLowerCase()];
    if (script) {
      const { stdout } = await execPowerShell(script, { timeout: 3000, notes });
      const path = stdout.trim();
      return path && existsSync(path) ? path : undefined;
    }
    if (app.processId) {
      const { scanProcessFiles } =
        await import("./research/electron/collectors/handle-scan-win.ts");
      return scanProcessFiles(app.processId, notes, 4000, ctx, app.windowTitle);
    }
  }
  return undefined;
}
