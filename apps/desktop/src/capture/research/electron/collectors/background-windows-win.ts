import { isBrowserApp, isMediaApp, isOfficeApp, isSelfApp } from "../../src/capture/app-catalog.ts";
import { mediaBasename } from "../../src/capture/background-merge.ts";
import { pickBestPath, rankCandidatePaths } from "../../src/capture/path-ranking.ts";
import { isAutoCapturableFile } from "../../src/capture/scannable-files.ts";
import type { BackgroundWindow } from "../../src/capture/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listOpenWindows,
  type CaptureContext,
} from "./capture-context.ts";
import { listRecentTargets, matchRecentByTitle } from "./document-path-win.ts";
import { describeExecError } from "./exec-note.ts";
import { requestProcessScan } from "./handle-scan-win.ts";
import { execPowerShell } from "./ps-queue.ts";

// Browsers are covered by the tab pipeline (extension merges all windows),
// the app itself is excluded by pid — everything else with a real title
// counts as a visible background window.
const MAX_WINDOWS = 20;
// One handle-table walk serves every pid, so the per-window cap of 3 (one
// walk each) is gone; this only bounds DuplicateHandle work per walk.
const MAX_SCAN_PIDS = 8;

type Win = { pid: number; proc: string; title: string };
type OfficeDoc = { appName: string; path: string };

// Windows: all titled top-level windows + open Office documents (precise
// per-doc files via COM — a background Word window's doc is enumerable even
// unfocused) + the SAME per-pid resolvers the foreground gets (handle scans
// for target apps). Media players need no window pass: background-media.ts
// already scans every player process, foreground or not.
export async function getBackgroundWindowsWindows(
  fgPid: number | undefined,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundWindow[]> {
  // Independent PowerShell work is issued up front so the ps-queue runs it
  // back-to-back (Office COM, Recent links) instead of waiting on JS between
  // steps; both are memoized/shared and never throw.
  const officeP = ctx.memo("win:office", () => readOfficeDocs(notes, ctx));
  const recentP = listRecentTargets(notes, ctx);
  const out: { item: BackgroundWindow; pid: number }[] = [];
  const wins = await enumerateWindows(ctx, notes);
  if (!wins) return [];
  for (const w of wins) {
    if (!w.title || w.pid === fgPid || w.pid === process.pid) continue;
    if (isBrowserApp(w.proc) || isSelfApp(w.proc)) continue;
    if (out.some((o) => o.pid === w.pid && o.item.windowTitle === w.title)) continue; // same window twice
    if (out.length < MAX_WINDOWS)
      out.push({ item: { appName: w.proc, windowTitle: w.title }, pid: w.pid });
  }
  // Office owns its own resolution (COM below); see app-catalog OFFICE_APP.
  const { isLocalFileApp } = await import("../../src/capture/app-catalog.ts");
  const routeForApp = (app: { appName: string; [key: string]: unknown }) =>
    isLocalFileApp(app.appName);
  const synthetic = (appName: string, windowTitle: string, processId: number) => ({
    bundleIdOrExe: appName,
    appName,
    windowTitle,
    processId,
    isPrivateWindow: false as const,
  });
  const isTarget = (appName: string, windowTitle: string, pid: number) =>
    !!routeForApp(synthetic(appName, windowTitle, pid));
  // Office open documents, focused or not — attached to their windows by
  // basename, so a background Word window resolves exactly like foreground.
  // When COM sees ZERO docs (blind instance), officeBlind stays true and
  // Recent matching below is allowed for Office too — no double-list risk
  // when there is nothing to double.
  const docs = await officeP;
  let officeDocCount = 0;
  if (docs) {
    const attached = attachOfficeDocs(
      out.map((o) => o.item),
      docs,
    );
    officeDocCount = docs.length;
    notes.push(`win:bgwin:office:docs=${docs.length}:attached=${attached}`);
    for (const d of docs) {
      if (out.length >= MAX_WINDOWS + 10) break;
      const base = d.path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
      const claimed = out.some((o) => o.item.filePath?.toLowerCase() === d.path.toLowerCase());
      if (!claimed && base)
        out.push({
          item: { appName: d.appName, windowTitle: mediaBasename(d.path), filePath: d.path },
          pid: -1,
        });
    }
  }
  // Same per-pid resolvers as foreground: handle scans for target apps
  // (Word/Acrobat/Sumatra behind the focused window included). ALL target
  // pids go into ONE walk via the batcher. Media players resolve via
  // background-media (timelines) instead.
  const officeBlind = officeDocCount === 0;
  const skipOffice = (appName: string): boolean => isOfficeApp(appName) && !officeBlind;
  const targets = out.filter(
    ({ item: w, pid }) =>
      !w.filePath &&
      pid > 0 &&
      !isMediaApp(w.appName) &&
      !skipOffice(w.appName) &&
      isTarget(w.appName, w.windowTitle, pid),
  );
  const scanPids = [...new Set(targets.map((t) => t.pid))].slice(0, MAX_SCAN_PIDS);
  const windowsPerPid = new Map<number, number>();
  for (const t of targets) windowsPerPid.set(t.pid, (windowsPerPid.get(t.pid) ?? 0) + 1);
  const scanned = new Map(
    await Promise.all(
      scanPids.map(
        async (pid) => [pid, rankCandidatePaths(await requestProcessScan(ctx, pid, 4000))] as const,
      ),
    ),
  );
  for (const { item: w, pid } of targets) {
    const ranked = scanned.get(pid);
    if (!ranked) continue; // beyond the scan cap
    const hit = pickWindowFile(ranked, w.windowTitle, (windowsPerPid.get(pid) ?? 0) > 1);
    if (hit && isAutoCapturableFile(w.appName, hit)) w.filePath = hit;
  }
  if (scanPids.length)
    notes.push(
      `win:bgwin:scans:pids=${scanPids.length}:resolved=${targets.filter((t) => t.item.filePath).length}`,
    );
  // Last resort for the rest: Recent-link basename matching.
  const needRecent = out.some(
    (o) => !o.item.filePath && !isMediaApp(o.item.appName) && !skipOffice(o.item.appName),
  );
  if (needRecent) {
    const recent = await recentP;
    let resolved = 0;
    for (const { item: w } of out) {
      if (w.filePath) continue;
      if (isMediaApp(w.appName) || skipOffice(w.appName)) continue;
      const hit = matchRecentByTitle(w.windowTitle, recent);
      if (hit && isAutoCapturableFile(w.appName, hit)) {
        w.filePath = hit;
        resolved++;
      }
    }
    notes.push(`win:bgwin:recent:resolved=${resolved}`);
  }
  const files = out.filter((o) => o.item.filePath).length;
  notes.push(`win:bgwin:windows=${out.length}:files=${files}`);
  return out.map((o) => o.item);
}

// Window list: native get-windows (no PowerShell, multi-window per process);
// the Get-Process MainWindowTitle script only when native is unavailable.
// `undefined` = both failed (note carries the cause).
async function enumerateWindows(ctx: CaptureContext, notes: string[]): Promise<Win[] | undefined> {
  const native = await listOpenWindows(ctx);
  if (native) {
    notes.push("win:bgwin:source=native");
    return native.map((w) => ({ pid: w.pid, proc: w.appName, title: w.title.trim() }));
  }
  try {
    const { stdout } = await execPowerShell(buildWindowsScript(), {
      timeout: collectorTimeout(ctx, 2500),
      maxBuffer: 1024 * 1024,
      notes,
    });
    notes.push("win:bgwin:source=powershell");
    return parseWindowsOutput(stdout);
  } catch (e) {
    notes.push(`win:bgwin:fail:${describeExecError(e)}`);
    return undefined;
  }
}

// Pure: "::WIN:: pid TAB proc TAB title" lines (MainWindowTitle fallback).
export function parseWindowsOutput(stdout: string): Win[] {
  const out: Win[] = [];
  for (const line of stdout
    .replace(/^\uFEFF/, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^::WIN:: (\d+)\t([^\t]*)\t(.*)$/.exec(line);
    if (m) out.push({ pid: Number(m[1]!), proc: m[2]!, title: m[3]!.trim() });
  }
  return out;
}

// COM-enumerated Office documents; undefined when the call itself failed.
async function readOfficeDocs(
  notes: string[],
  ctx: CaptureContext,
): Promise<OfficeDoc[] | undefined> {
  try {
    const { stdout } = await execPowerShell(buildOfficeDocsScript(), {
      timeout: collectorTimeout(ctx, 2500),
      maxBuffer: 1024 * 1024,
      notes,
    });
    return parseOfficeDocsOutput(stdout);
  } catch (e) {
    notes.push(`win:bgwin:office:fail:${describeExecError(e)}`);
    return undefined;
  }
}

export function parseOfficeDocsOutput(stdout: string): OfficeDoc[] {
  const docs: OfficeDoc[] = [];
  for (const line of stdout
    .replace(/^\uFEFF/, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^::DOC:: ([^\t]*)\t(.*)$/.exec(line);
    if (!m) continue;
    const p = m[2]!.trim();
    if (p) docs.push({ appName: m[1]!.trim(), path: p });
  }
  return docs;
}

// Pure: pick the open file for one window out of its process's ranked
// handles. The title naming a file beats rank (pickBestPath). When several
// windows share one pid (two Sumatra windows) the process holds BOTH files, so
// rank alone would give them the same one — then only a title-named file counts.
export function pickWindowFile(
  ranked: string[],
  windowTitle: string,
  sharedPid: boolean,
): string | undefined {
  const hit = pickBestPath(ranked, windowTitle);
  if (!hit || !sharedPid) return hit;
  const t = windowTitle.toLowerCase();
  const base = (hit.split(/[\\/]/).pop() ?? "").toLowerCase();
  const stem = base.replace(/\.[a-z0-9]+$/, "");
  return (base && t.includes(base)) || (stem.length >= 4 && t.includes(stem)) ? hit : undefined;
}

// Pure: attach COM-enumerated Office docs to the windows showing them
// (basename-in-title). Returns attach count; callers list leftovers.
export function attachOfficeDocs(
  windows: BackgroundWindow[],
  docs: { appName: string; path: string }[],
): number {
  let attached = 0;
  for (const d of docs) {
    const base = d.path.split(/[\\/]/).pop()?.trim().toLowerCase() ?? "";
    if (!base) continue;
    const w = windows.find((w) => !w.filePath && w.windowTitle.toLowerCase().includes(base));
    if (w) {
      w.filePath = d.path;
      if (!/winword|excel|powerpnt|word|excel|powerpoint/i.test(w.appName)) w.appName = d.appName;
      attached++;
    }
  }
  return attached;
}

// Exported for tests and scripts/print-ps.ts (add --wins / --officedocs there to paste-verify).
export function buildWindowsScript(): string {
  // EnumWindows covers every titled top-level window, including multiple windows per PID.
  return `${buildEnumWindowsTypeScript()}
[CaptureWindows]::Read() | ForEach-Object { "::WIN:: " + $_.Pid + [char]9 + $_.Proc + [char]9 + $_.Title }`;
}

export function buildOfficeDocsScript(): string {
  return [
    "try { $w=[Runtime.InteropServices.Marshal]::GetActiveObject('Word.Application'); $w.Documents | ForEach-Object { try { $f=$_.FullName; if ($f) { \"::DOC:: Word\" + [char]9 + $f } } catch {} } } catch {}",
    "try { $e=[Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application'); $e.Workbooks | ForEach-Object { try { $f=$_.FullName; if ($f) { \"::DOC:: Excel\" + [char]9 + $f } } catch {} } } catch {}",
    "try { $p=[Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application'); $p.Presentations | ForEach-Object { try { $f=$_.FullName; if ($f) { \"::DOC:: PowerPoint\" + [char]9 + $f } } catch {} } } catch {}",
  ].join("\n");
}

export function buildEnumWindowsTypeScript(): string {
  return `if (-not ('CaptureWindows' -as [type])) { Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CaptureWindows {
  public class Entry { public int Pid; public string Proc; public string Title; }
  private delegate bool Callback(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Callback cb, IntPtr param);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  public static Entry[] Read() {
    var rows = new List<Entry>();
    EnumWindows(delegate(IntPtr hwnd, IntPtr unused) {
      if (rows.Count >= 100 || !IsWindowVisible(hwnd)) return true;
      var text = new StringBuilder(2048); GetWindowText(hwnd, text, text.Capacity);
      if (text.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(hwnd, out pid);
      try { rows.Add(new Entry {Pid=(int)pid, Proc=Process.GetProcessById((int)pid).ProcessName, Title=text.ToString().Replace('\\t', ' ').Replace('\\r', ' ').Replace('\\n', ' ')}); } catch {}
      return true;
    }, IntPtr.Zero);
    return rows.ToArray();
  }
}
'@ }
`;
}
