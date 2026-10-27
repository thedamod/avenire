import { BROWSER_HINT, isMediaApp } from "../../src/capture/app-catalog.ts";
import { mediaBasename, mergeSessionsAndFiles } from "../../src/capture/background-merge.ts";
import type { BackgroundMediaItem } from "../../src/capture/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listProcesses,
  type CaptureContext,
  type ProcEntry,
} from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";
import { scanProcessFiles } from "./handle-scan-win.ts";
import { execPowerShell } from "./ps-queue.ts";

// Player process names worth handle-scanning (local files live here).
// NOTE: the Win11 Media Player runs as Microsoft.Media.Player (NOT Video.UI
// — that's the old Films & TV app). Missing it meant background scans never
// even looked at the right pid.
// Browsers never get file handle scans: their SMTC sessions are only used
// to correlate positions with permitted browser tabs.
// Trailing * = prefix match; everything else is an exact (case-insensitive) name.
const PLAYER_PROCS = [
  "vlc",
  "mpv",
  "mpc-hc",
  "mpc-hc64",
  "mpc-be64",
  "PotPlayer*",
  "wmplayer",
  "Microsoft.Media.Player",
  "Video.UI",
  "Music.UI",
  "GrooveMusic",
  "kodi",
  "Plex*",
  "Jellyfin*",
  "GOM",
  "QMPlay2",
];
// One handle-table walk covers every pid, so the old cap of 3 can be generous.
const MAX_PLAYER_PIDS = 6;
// AUMID fragments to friendly names (SMTC sessions carry no exe).
const AUMID_NAMES: [RegExp, string][] = [
  [/zunemusic/i, "Groove Music"],
  [/zunevideo/i, "Media Player"],
  [/spotify/i, "Spotify"],
  [/vlc/i, "vlc"],
  [/mpv/i, "mpv"],
];

function friendlyApp(aumid: string, fallbackProc = ""): string {
  for (const [re, name] of AUMID_NAMES) if (re.test(aumid)) return name;
  const m = /([^!\\]+)(?:\.exe)?$/i.exec(aumid);
  return m?.[1] || fallbackProc || "media-session";
}

export type SmtcSession = {
  aumid: string;
  appName: string;
  title: string;
  artist?: string;
  status: string; // 'Playing' | 'Paused' | whatever SMTC said (Stopped, Closed…)
  positionSec?: number;
  durationSec?: number;
  browser: boolean; // browser sessions may only enrich an independently permitted tab
};
export type SmtcSnapshot = {
  sessions: SmtcSession[];
  // SourceAppUserModelId of GetCurrentSession() — the one now-playing/timeline use.
  current?: string;
  error?: string;
};

// ONE SMTC read per snapshot, memoized: foreground now-playing, timeline and
// background media all derive from it (they used to call RequestAsync three
// separate times, each in its own PowerShell process). Never throws.
export function getSmtcSessions(ctx: CaptureContext): Promise<SmtcSnapshot> {
  return ctx.memo("win:smtc", async (): Promise<SmtcSnapshot> => {
    try {
      const { stdout, stderr } = await execPowerShell(buildSmtcScript(), {
        timeout: collectorTimeout(ctx, 8000),
        maxBuffer: 1024 * 1024,
        notes: ctx.notes,
      });
      const parsed = parseSessionsOutput(stdout);
      // WinRT failures are reported (not thrown) by the script's outer catch —
      // surface them, else "sessions=0" can't tell "nothing playing" from
      // "RequestAsync threw".
      if (parsed.error) ctx.notes.push(`win:bgmedia:smtc:err:${sanitize(parsed.error)}`);
      if (stderr.trim()) ctx.notes.push(`win:bgmedia:smtc:stderr:${sanitize(stderr)}`);
      return parsed;
    } catch (e) {
      ctx.notes.push(`win:bgmedia:smtc:fail:${describeExecError(e)}`);
      return { sessions: [] };
    }
  });
}

// Windows: ALL SMTC sessions (playing AND paused — a paused lecture is
// study context, never ignored) + handle scans of player processes.
// Player pids come from tasklist.exe via listProcesses (plain spawn, no
// powershell: the Get-Process half kept dying with the same bare exit-1 as
// SMTC (O10)). SMTC still needs PowerShell (WinRT has no cmd.exe equivalent).
// SMTC and the scans are independent, so both are issued together: they queue
// back-to-back in the ps-queue with no JS gap between them.
export async function getBackgroundMediaWindows(
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundMediaItem[]> {
  const smtcP = getSmtcSessions(ctx);
  const playersP = listProcesses(ctx).then(filterPlayerProcs);
  const filesP = playersP.then((players) =>
    // All pids fold into one handle-table walk (requestProcessScan batches).
    Promise.all(
      players.map(async ({ pid, name }) => ({
        appName: friendlyProcName(name),
        path: await scanProcessFiles(pid, notes, 4000, ctx),
      })),
    ),
  );
  const [smtc, players, scanned] = await Promise.all([smtcP, playersP, filesP]);
  const sessions = backgroundSessions(smtc.sessions);
  // Brokered/UWP players may hold no file handle. Recent is only matched with a title.
  const { listRecentTargets, pickRecentMedia } = await import("./document-path-win.ts");
  const recent =
    Date.now() < ctx.deadline && sessions.some((session) => isMediaApp(session.appName))
      ? await listRecentTargets(notes, ctx)
      : [];
  for (const session of sessions) {
    if (
      !isMediaApp(session.appName) ||
      scanned.some(
        (file) => file.path && file.appName.toLowerCase() === session.appName.toLowerCase(),
      )
    )
      continue;
    const path = pickRecentMedia(recent, session.title);
    if (path) Object.assign(session, { filePath: path, path_source: "mru" });
  }
  const sessionApps =
    [...new Set(sessions.map((s) => s.appName.replace(/\s+/g, "")))].join("+") || "-";
  const procNames = players.map((p) => p.name).join("+") || "-";
  notes.push(
    `win:bgmedia:sessions=${sessions.length}[${sessionApps}]:procs=${players.length}[${procNames}]`,
  );
  const files = scanned.flatMap((s) => (s.path ? [{ appName: s.appName, path: s.path }] : []));
  return [
    ...mergeSessionsAndFiles(
      sessions.filter((s) => !s.browser),
      files,
    ),
    ...sessions.filter((s) => s.browser),
  ];
}

// Pure: sessions worth reporting as BACKGROUND media — titled, playing or
// paused; browser sessions are correlated by the native adapter, never independent sources.
export function backgroundSessions(all: SmtcSession[]): SmtcSession[] {
  return all
    .filter((s) => s.title && /playing|paused/i.test(s.status))
    .map((s) => ({
      ...s,
      status: /paused/i.test(s.status) ? "Paused" : "Playing",
    }));
}

// Pure: the session GetCurrentSession() pointed at, if it carried a title.
export function currentSession(snap: SmtcSnapshot): SmtcSession | undefined {
  if (!snap.current) return undefined;
  return snap.sessions.find((s) => s.aumid === snap.current);
}

// Pure: player processes among a process list (names are exe basenames
// without .exe, as listProcesses yields them). Same PLAYER_PROCS rules as the
// legacy PowerShell half: exact names or trailing-* prefixes, case-insensitive.
export function filterPlayerProcs(procs: ProcEntry[]): { pid: number; name: string }[] {
  const matchers = PLAYER_PROCS.map((s) => s.toLowerCase());
  const out: { pid: number; name: string }[] = [];
  for (const { pid, name } of procs) {
    const base = name.replace(/\.exe$/i, "").toLowerCase();
    const hit = matchers.some((pat) =>
      pat.endsWith("*") ? base.startsWith(pat.slice(0, -1)) : base === pat,
    );
    if (hit && out.length < MAX_PLAYER_PIDS) out.push({ pid, name });
  }
  return out;
}

function friendlyProcName(proc: string): string {
  const base = proc.replace(/\.exe$/i, "");
  if (/^video\.ui$/i.test(base)) return "Films & TV";
  if (/^music\.ui$/i.test(base)) return "Groove Music";
  return mediaBasename(base);
}

// Exported for tests: the wire format has no PowerShell here to validate it,
// so parsing is unit-tested instead. Lines: ::CURRENT:: <aumid>, ::ERR:: <msg>,
// ::SESSION:: aumid TAB artist TAB title TAB status TAB pos TAB dur.
export function parseSessionsOutput(stdout: string): SmtcSnapshot {
  const sessions: SmtcSession[] = [];
  let current: string | undefined;
  let error: string | undefined;
  for (const line of stdout
    .replace(/^﻿/, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (line.startsWith("::CURRENT:: ")) {
      current = line.slice("::CURRENT:: ".length).trim() || undefined;
      continue;
    }
    if (line.startsWith("::ERR:: ")) {
      error = line.slice("::ERR:: ".length).trim();
      continue;
    }
    // Split-based (not regex): trailing empty timeline fields get trimmed,
    // so a strict pattern would drop real sessions with no timeline.
    if (!line.startsWith("::SESSION:: ")) continue;
    const [aumid = "", artist = "", title = "", status = "", pos = "", dur = ""] = line
      .slice("::SESSION:: ".length)
      .split("\t");
    const t = title.trim();
    if (!t) continue;
    const positionSec = pos ? Number(pos) : NaN;
    const durationSec = dur ? Number(dur) : NaN;
    sessions.push({
      aumid: aumid.trim(),
      appName: friendlyApp(aumid),
      title: t,
      ...(artist.trim() ? { artist: artist.trim().slice(0, 200) } : {}),
      status: status.trim(),
      ...(Number.isFinite(positionSec) && positionSec >= 0 ? { positionSec } : {}),
      ...(Number.isFinite(durationSec) && durationSec > 0 ? { durationSec } : {}),
      browser: BROWSER_HINT.test(aumid),
    });
  }
  return { sessions, ...(current ? { current } : {}), ...(error ? { error } : {}) };
}

// WinRT await helper (shared with now-playing-win.ts). WHY: calling
// .GetAwaiter().GetResult() directly on a WinRT IAsyncOperation fails with
// "System.__ComObject does not contain a method named 'GetAwaiter'" —
// GetAwaiter is an EXTENSION method PowerShell can't resolve on a raw COM
// object (proven on-box: interactive AND spawned runspaces alike). The
// working pattern (see scripts/script2 pattern) is Add-Type
// System.Runtime.WindowsRuntime + WindowsRuntimeSystemExtensions.AsTask<T>
// via reflection, then await the resulting Task (a REAL .NET method).
// NOTE: no backtick characters anywhere in the script strings below —
// PowerShell escape sequences and generic-arity suffixes use them, and any
// one of them would terminate the enclosing TS template literal. Tabs come
// from [char]9, and the AsTask overload is matched with -like instead of
// naming the generic Task type directly.
// NOTE 2: the WinRT static call must stay an inline literal — [$var] is a
// PowerShell parse error that kills the whole script.
// NOTE 3: the assembly load is guarded — inside the persistent host the type
// usually exists already (Add-Type is session-wide), and no script may `exit`
// (it would kill the host); failures are reported with ::ERR:: markers.
export function buildAwaitWinRtHelper(): string {
  return [
    "if (-not ('System.WindowsRuntimeSystemExtensions' -as [type])) { Add-Type -AssemblyName System.Runtime.WindowsRuntime }",
    "function Await-WinRT($op, [type]$t) {",
    "  $cvt = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' } | Select-Object -First 1;",
    "  return $cvt.MakeGenericMethod($t).Invoke($null, @($op)).GetAwaiter().GetResult();",
    "}",
  ].join("\n");
}

// Pre-loads the WinRT projection + SMTC type so the first capture's SMTC call
// doesn't pay the assembly load (warmPowerShellHost).
export function buildWinRtWarmScript(): string {
  return `${buildAwaitWinRtHelper()}
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime];
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime];
Add-Type -AssemblyName System.Windows.Forms;`;
}

// The single SMTC script: every session with title/status/timeline plus which
// one is the current session. Timeline: GetTimelineProperties() is a plain
// SYNC method (there is no ...Async variant — the old script called a method
// that doesn't exist, and named a nonexistent *TimelineProperties type, so
// positions never worked). Exported so the exact text is unit-tested and
// paste-debuggable via scripts/print-ps.ts.
export function buildSmtcScript(): string {
  return `$tab = [char]9;
try {
${buildAwaitWinRtHelper()}
  $mgrT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime];
  $propT = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime];
  $m = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime]::RequestAsync()) $mgrT;
  $cur = "";
  try { $cs = $m.GetCurrentSession(); if ($cs) { $cur = "$($cs.SourceAppUserModelId)" } } catch {}
  "::CURRENT:: " + $cur;
  foreach ($s in $m.GetSessions()) {
    try {
      $p = Await-WinRT ($s.TryGetMediaPropertiesAsync()) $propT;
      $a = "$($p.Artist)".Trim();
      $t = "$($p.Title)".Trim();
      $pos = ""; $dur = "";
      try {
        $tl = $s.GetTimelineProperties();
        $pos = "$($tl.Position.TotalSeconds)"; $dur = "$($tl.EndTime.TotalSeconds)"
      } catch {}
      if ($t) { $st = "$($s.GetPlaybackInfo().PlaybackStatus)"; "::SESSION:: " + $s.SourceAppUserModelId + $tab + $a + $tab + $t + $tab + $st + $tab + $pos + $tab + $dur }
    } catch {}
  }
} catch { "::ERR:: SMTC-ERR: " + $_.Exception.Message }`;
}

// One-line stderr sanitizer for the notes above (mirrors exec-note rules).
function sanitize(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9 _.:+()-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
