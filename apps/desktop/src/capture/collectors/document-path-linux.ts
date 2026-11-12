import { existsSync, readdirSync, readlinkSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { pickBestPath, rankCandidatePaths } from "../support/path-ranking.ts";
import { isScannableFilePath } from "../support/scannable-files.ts";
import type { ForegroundApp } from "../support/types.ts";
import { createCaptureContext, type CaptureContext } from "./capture-context.ts";

// Linux: /proc/<pid>/fd symlink scan, then argv as a fallback. Code editors
// are parked (docs/IMPROVEMENTS.md) — no workspace/title resolution here.
// Scans are memoized per pid for the snapshot: the same process is asked by
// foreground, background-windows and background-media in parallel.
export async function resolveDocumentPathLinux(
  app: ForegroundApp,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  const pid = app.processId;
  if (!pid) {
    notes.push("linux:doctrace:no-pid");
    return undefined;
  }
  const scan = await ctx.memo(`doc:linux:${pid}`, async () => scanPid(pid));
  // Memoized scan: report its notes once, not once per asking collector.
  if (!scan.reported) {
    scan.reported = true;
    notes.push(...scan.notes);
  }
  return pickBestPath(scan.paths, app.windowTitle);
}

type Scan = { paths: string[]; notes: string[]; reported?: boolean };

function scanPid(pid: number): Scan {
  const notes: string[] = [];
  try {
    const fds = readdirSync(`/proc/${pid}/fd`);
    const targets: string[] = [];
    for (const fd of fds) {
      try {
        targets.push(readlinkSync(`/proc/${pid}/fd/${fd}`));
      } catch {
        continue; // fd closed mid-walk
      }
    }
    // Rank BEFORE existsSync: app assets (fonts, license.txt, bundled docs) are
    // dropped, and user roots outrank whatever else the process holds open.
    const paths = rankCandidatePaths(targets).filter((p) => existsSync(p));
    if (paths.length) {
      notes.push(`linux:proc:fds=${fds.length}:hit`);
      return { paths, notes };
    }
    notes.push(`linux:proc:fds=${fds.length}:hits=0`);
  } catch {
    notes.push("linux:proc:error");
  }
  // Viewers like zathura/evince/okular/mpv-with-script often keep NO fd open
  // between reads but were launched with the path as an argument.
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    let cwd: string | undefined;
    try {
      cwd = readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      /* relative args just stay unresolved */
    }
    const paths = rankCandidatePaths(pathsFromCmdline(cmdline, cwd)).filter((p) => existsSync(p));
    if (paths.length) {
      notes.push("linux:proc:cmdline:hit");
      return { paths, notes };
    }
  } catch {
    // cmdline unreadable (exited / other user) — no path
  }
  return { paths: [], notes };
}

// Exported for tests. /proc/<pid>/cmdline (NUL-separated argv) → absolute
// scannable-looking paths. Skips argv[0]; handles `--file=x`, file:// URIs and
// relative args resolved against the process cwd (dropped when cwd unknown).
export function pathsFromCmdline(cmdline: string, cwd?: string): string[] {
  const out: string[] = [];
  for (let arg of cmdline.split("\0").slice(1)) {
    if (!arg) continue;
    const opt = /^--?[A-Za-z][\w-]*=(.+)$/.exec(arg);
    if (opt) arg = opt[1]!;
    if (/^file:\/\//i.test(arg)) {
      try {
        arg = fileURLToPath(arg, { windows: false });
      } catch {
        continue;
      }
    }
    if (!isScannableFilePath(arg)) continue;
    if (arg.startsWith("/")) out.push(arg);
    else if (cwd && !arg.startsWith("-") && !/^[a-z][a-z0-9+.-]*:/i.test(arg))
      out.push(posix.resolve(cwd, arg));
  }
  return out;
}
