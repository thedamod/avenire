import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { isBrowserApp, isLocalFileApp, isSelfApp } from "../support/app-catalog.ts";
import { isAutoCapturableFile } from "../support/scannable-files.ts";
import type { BackgroundWindow } from "../support/types.ts";
import { collectorTimeout, createCaptureContext, type CaptureContext } from "./capture-context.ts";
import { scanMacProcess } from "./document-path-mac.ts";
import { describeExecError } from "./exec-note.ts";
const exec = promisify(execFile);

/** AX windows are queried on each running application PID; no application is launched. */
export function buildAxWindowsScript(): string {
  return `const se = Application('System Events');
const result = [];
for (const p of se.applicationProcesses()) {
  try {
    const pid = p.unixId(); const owner = p.name();
    for (const w of p.windows()) {
      if (result.length >= 100) break;
      let document = ''; try { document = w.attributes.byName('AXDocument').value() || ''; } catch (_) {}
      result.push({pid, owner, title: w.name() || '', document});
    }
  } catch (_) {}
}
JSON.stringify(result);`;
}
export function parseAxWindows(
  stdout: string,
): Array<{ pid: number; owner: string; title: string; filePath?: string }> {
  try {
    const rows: unknown = JSON.parse(stdout);
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 100).flatMap((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        !Number.isSafeInteger(row.pid) ||
        row.pid <= 0 ||
        typeof row.owner !== "string" ||
        typeof row.title !== "string"
      )
        return [];
      let filePath: string | undefined;
      try {
        if (typeof row.document === "string" && row.document.startsWith("file:"))
          filePath = fileURLToPath(row.document, { windows: false });
      } catch {
        /* unavailable AXDocument */
      }
      return [
        { pid: row.pid, owner: row.owner, title: row.title, ...(filePath ? { filePath } : {}) },
      ];
    });
  } catch {
    return [];
  }
}
export async function getBackgroundWindowsMac(
  fgPid: number | undefined,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundWindow[]> {
  try {
    const { stdout } = await exec("osascript", ["-l", "JavaScript", "-e", buildAxWindowsScript()], {
      timeout: collectorTimeout(ctx, 2500),
      maxBuffer: 1024 * 1024,
    });
    const rows = parseAxWindows(stdout)
      .filter(
        (w) =>
          w.pid !== fgPid && w.pid !== process.pid && !isBrowserApp(w.owner) && !isSelfApp(w.owner),
      )
      .slice(0, 20);
    const pids = new Set<number>();
    return await Promise.all(
      rows.map(async (row): Promise<BackgroundWindow> => {
        const item: BackgroundWindow = { appName: row.owner, windowTitle: row.title };
        if (!isLocalFileApp(row.owner)) return item;
        if (row.filePath && isAutoCapturableFile(row.owner, row.filePath))
          return { ...item, filePath: row.filePath };
        if (!pids.has(row.pid) && pids.size >= 3) return item;
        pids.add(row.pid);
        const hit = await scanMacProcess(row.pid, notes, ctx, row.title);
        return hit && isAutoCapturableFile(row.owner, hit) ? { ...item, filePath: hit } : item;
      }),
    );
  } catch (error) {
    notes.push(`mac:bgwin:ax-fail:${describeExecError(error)}`);
    return [];
  }
}
