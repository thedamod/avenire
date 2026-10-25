import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { pickBestPath, rankCandidatePaths } from "../../src/capture/path-ranking.ts";
import type { ForegroundApp } from "../../src/capture/types.ts";
import { createCaptureContext, type CaptureContext } from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";

const execFileAsync = promisify(execFile);

// macOS: Office via AppleScript ("Microsoft Word/Excel/PowerPoint" display
// names); everything else via lsof open-file scan on the focused pid.
// Needs Automation permission for Office; lsof needs nothing special.
export async function resolveDocumentPathMac(
  app: ForegroundApp,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  const name = app.appName.toLowerCase();
  if (name === "microsoft word") {
    const p = await osascriptPath(
      'tell application "Microsoft Word" to get full name of active document',
      "word",
      notes,
    );
    if (p) return p;
  } else if (name === "microsoft excel") {
    const p = await osascriptPath(
      'tell application "Microsoft Excel" to get full name of active workbook',
      "excel",
      notes,
    );
    if (p) return p;
  } else if (name === "microsoft powerpoint") {
    const p = await osascriptPath(
      'tell application "Microsoft PowerPoint" to get full name of active presentation',
      "ppt",
      notes,
    );
    if (p) return p;
  }
  if (app.processId)
    return pickBestPath(await lsofScan(app.processId, notes, ctx), app.windowTitle);
  notes.push("mac:doctrace:no-pid");
  return undefined;
}

async function osascriptPath(
  script: string,
  tag: string,
  notes: string[],
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 5000 });
    const p = stdout.trim();
    if (p && existsSync(p)) {
      notes.push(`mac:osascript:${tag}:hit`);
      return p;
    }
    notes.push(`mac:osascript:${tag}:miss`);
    return undefined;
  } catch (e) {
    // -1743 = Automation denied; surfaced so a missing grant is diagnosable.
    notes.push(`mac:osascript:${tag}:error:${describeExecError(e)}`);
    return undefined;
  }
}

// lsof fd columns that are never "a file the user opened": cwd/root dirs, the
// executable text segment, and memory-mapped libs/fonts/dictionaries.
const NON_DOC_FD = new Set(["cwd", "rtd", "txt", "mem"]);

// Exported for tests: `lsof -Ffn` field output ("f<fd>" then "n<name>" per
// file) → absolute names of real file descriptors only.
export function parseLsofNames(stdout: string): string[] {
  const out: string[] = [];
  let fd = "";
  for (const line of stdout.split("\n")) {
    if (line.startsWith("f")) fd = line.slice(1);
    else if (line.startsWith("n/") && !NON_DOC_FD.has(fd)) out.push(line.slice(1));
  }
  return out;
}

// Ranked, existing candidates for one pid; memoized for the snapshot because
// foreground, background-windows and background-media can all ask for it.
function lsofScan(pid: number, notes: string[], ctx: CaptureContext): Promise<string[]> {
  return ctx.memo(`doc:mac:${pid}`, async () => {
    try {
      // -n/-P: no DNS or port-name lookups — the slow part of a bare lsof.
      const { stdout } = await execFileAsync("lsof", ["-n", "-P", "-p", String(pid), "-Ffn"], {
        timeout: 5000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const paths = rankCandidatePaths(parseLsofNames(stdout)).filter((p) => existsSync(p));
      notes.push(`mac:lsof:pid=${pid}:hits=${paths.length}`);
      return paths;
    } catch (e) {
      notes.push(`mac:lsof:error:${describeExecError(e)}`);
      return [];
    }
  });
}

// Exported for background-media-mac.ts: lsof-scan an arbitrary pid.
export async function scanMacProcess(
  pid: number,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
  windowTitle?: string,
): Promise<string | undefined> {
  return pickBestPath(await lsofScan(pid, notes, ctx), windowTitle);
}
