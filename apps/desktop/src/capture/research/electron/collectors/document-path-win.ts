import { existsSync } from "node:fs";
import { mediaBasename } from "../../src/capture/background-merge.ts";
import { rankCandidatePaths } from "../../src/capture/path-ranking.ts";
import { isMatchableFilePath, isScannableFilePath } from "../../src/capture/scannable-files.ts";
import type { ForegroundApp } from "../../src/capture/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listProcesses,
  type CaptureContext,
} from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";
import { scanProcessFiles } from "./handle-scan-win.ts";
import { execPowerShell } from "./ps-queue.ts";

// Re-exported: the scanner moved to handle-scan-win.ts (batched, class 64).
export { nonScannableExtensions, scanProcessFiles } from "./handle-scan-win.ts";

// Windows: active Office document via COM GetActiveObject, else a generic
// open-file-handle scan of the focused pid (covers Media Player, VLC, mpv,
// Sumatra, Acrobat… — anything holding the file open).
// Verified progIds/exes (MS Support): Word WINWORD.EXE, Excel EXCEL.EXE,
// PowerPoint POWERPNT.EXE. Everything else -> handle scan or undefined.
export async function resolveDocumentPathWindows(
  app: ForegroundApp,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  const name = app.appName.toLowerCase();
  if (name === "winword")
    return comActivePath("Word.Application", "ActiveDocument.FullName", "word", notes);
  if (name === "excel")
    return comActivePath("Excel.Application", "ActiveWorkbook.FullName", "excel", notes);
  if (name === "powerpnt")
    return comActivePath("PowerPoint.Application", "ActivePresentation.FullName", "ppt", notes);
  if (!app.processId) {
    notes.push("win:doctrace:no-pid");
    return undefined;
  }
  // Gate the scan to target apps only — never pay it for browsers or random
  // windows (even batched, a walk costs a PowerShell round-trip).
  const { isLocalFileApp } = await import("../../src/capture/app-catalog.ts");
  const routeForApp = (app: ForegroundApp) => isLocalFileApp(app.appName);
  if (!routeForApp(app)) {
    notes.push("win:doctrace:skip:not-target");
    return undefined;
  }
  const hit = await scanProcessFiles(app.processId, notes, 4000, ctx, app.windowTitle);
  if (hit) return hit;
  // The foreground pid can be a stale/zombie instance while a sibling holds
  // the media (proven in the wild: scanned pid held 12 app files, sibling
  // pid held the playing mp4). Media apps only — a second winword.exe with
  // another doc would misattribute.
  const { isMediaAppName } = await import("./now-playing.ts");
  if (isMediaAppName(app.appName, app.bundleIdOrExe)) {
    return scanSiblings(app.appName, app.processId, notes, ctx);
  }
  return undefined;
}

// Exported for tests. Same-exe sibling processes (new instance, split
// UI/playback) get scanned when the foreground pid missed. Cap 2 — this is a
// fallback, not a census. Siblings come from the shared process list (no
// PowerShell) and both scans fold into ONE handle-table walk.
export async function scanSiblings(
  exeBase: string,
  skipPid: number,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  if (!Number.isInteger(skipPid) || skipPid <= 0) return undefined;
  try {
    const want = exeBase.toLowerCase();
    const pids = (await listProcesses(ctx))
      .filter((p) => p.pid !== skipPid && p.name.toLowerCase() === want)
      .map((p) => p.pid)
      .slice(0, 2);
    notes.push(`win:siblings:${exeBase}:count=${pids.length}`);
    const hits = await Promise.all(pids.map((pid) => scanProcessFiles(pid, notes, 3000, ctx)));
    return hits.find((h) => !!h);
  } catch (e) {
    notes.push(`win:siblings:fail:${describeExecError(e)}`);
  }
  return undefined;
}

export type RecentEntry = { target: string; mtimeMs: number };

// Pure: pick the played file from resolved shell Recent links.
// Title-word overlap is MANDATORY — without a hint there is no attribution,
// and "most recent media file" misattributes (proven in the wild: a lecture
// watched earlier attached itself to an Obsidian note). No hint → undefined.
export function pickRecentMedia(
  entries: RecentEntry[],
  titleHint: string | undefined,
): string | undefined {
  const media = entries.filter((e) => isScannableFilePath(e.target));
  if (media.length === 0 || !titleHint?.trim()) return undefined;
  const hintWords = new Set(
    titleHint
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
  let best: string | undefined;
  let bestScore = 0;
  for (const e of media) {
    const base = mediaBasename(e.target)
      .replace(/\.[a-z0-9]+$/i, "")
      .toLowerCase();
    const score = base.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && hintWords.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = e.target;
    }
  }
  return best;
}

// Fallback for brokered players (UWP Media Player opens files out-of-process,
// so no handle exists on its pid): resolve shell Recent .lnk targets and
// match against the SMTC title. Refuses to run without a hint (see above).
// No admin, no Add-Type — plain COM read.
export async function recentMediaPath(
  titleHint: string | undefined,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<string | undefined> {
  if (process.platform !== "win32") return undefined;
  if (!titleHint?.trim()) {
    notes.push("win:recent:skipped:no-hint");
    return undefined;
  }
  const entries = await listRecentTargets(notes, ctx);
  const picked = pickRecentMedia(entries, titleHint);
  notes.push(`win:recent:checked=${entries.length}:picked=${picked ? "yes" : "no"}`);
  return picked;
}

// Exported for background-windows-win.ts: raw resolved Recent targets
// (caller matches by its own rule — media title overlap, window basename…).
// Memoized per snapshot ('win:recent'): the foreground media fallback and the
// background-window pass share ONE shell-link walk.
export function listRecentTargets(
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<RecentEntry[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  return ctx.memo("win:recent", async () => {
    try {
      const { stdout } = await execPowerShell(buildRecentScript(), {
        timeout: collectorTimeout(ctx, 1800),
        maxBuffer: 1024 * 1024,
        notes: ctx.notes,
      });
      return parseRecentOutput(stdout);
    } catch (e) {
      ctx.notes.push(`win:recent:fail:${describeExecError(e)}`);
      return [];
    }
  });
}

// Pure: "<ISO mtime>|<target>" lines -> entries.
export function parseRecentOutput(stdout: string): RecentEntry[] {
  const entries: RecentEntry[] = [];
  for (const line of stdout
    .replace(/^\uFEFF/, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const sep = line.indexOf("|");
    if (sep < 0) continue;
    const mtimeMs = Date.parse(line.slice(0, sep));
    const target = line.slice(sep + 1).trim();
    if (target && !Number.isNaN(mtimeMs)) entries.push({ target, mtimeMs });
  }
  return entries;
}

// Pure: match a window title against Recent targets by exact basename
// ("last-capture.json - Notepad" ↔ …\last-capture.json). Basename must carry
// an extension and be longer than 4 chars — generic titles ("Status",
// "WhatsApp") can never match. Longest basename wins on ties.
export function matchRecentByTitle(title: string, entries: RecentEntry[]): string | undefined {
  const t = title.toLowerCase();
  let best: string | undefined;
  for (const e of entries) {
    const base = e.target.split(/[\\/]/).pop()?.trim() ?? "";
    if (base.length <= 4 || !isMatchableFilePath(base)) continue;
    if (
      t.includes(base.toLowerCase()) &&
      (!best || base.length > (best.split(/[\\/]/).pop()?.length ?? 0))
    ) {
      best = e.target;
    }
  }
  return best;
}

// Exported for tests (no PowerShell here to syntax-check it).
export function buildRecentScript(): string {
  return `$recent = Join-Path $env:APPDATA 'Microsoft\\Windows\\Recent';
$ws = New-Object -ComObject WScript.Shell;
Get-ChildItem -Path $recent -Filter *.lnk -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 30 |
  ForEach-Object {
    try {
      $t = $ws.CreateShortcut($_.FullName).TargetPath;
      if ($t) { $_.LastWriteTime.ToString('o') + '|' + $t }
    } catch {}
  }`;
}

// Pure: choose the most plausible user file from raw scanned paths — thin
// wrapper over the shared ranker (drops app assets/system paths, user
// documents first). Kept exported for tests.
export function pickScannedPath(paths: string[]): string | undefined {
  return rankCandidatePaths(paths)[0];
}

// Exported for tests (no PowerShell here to syntax-check it).
export function buildComActiveScript(progId: string, expr: string): string {
  return `$o=[Runtime.InteropServices.Marshal]::GetActiveObject('${progId}'); $o.${expr}`;
}

async function comActivePath(
  progId: string,
  expr: string,
  tag: string,
  notes: string[],
): Promise<string | undefined> {
  try {
    const { stdout } = await execPowerShell(buildComActiveScript(progId, expr), {
      timeout: 2500,
      notes,
    });
    const p = stdout.trim().split("\n").pop()?.trim();
    if (p && existsSync(p)) {
      notes.push(`win:com:${tag}:hit`);
      return p;
    }
    notes.push(`win:com:${tag}:miss`);
    return undefined;
  } catch (e) {
    notes.push(`win:com:${tag}:fail:${describeExecError(e)}`);
    return undefined;
  }
}
