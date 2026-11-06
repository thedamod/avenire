import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BROWSER_HINT, isMediaApp } from "../support/app-catalog.ts";
import { mergeSessionsAndFiles } from "../support/background-merge.ts";
import type { BackgroundMediaItem } from "../support/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listProcesses,
  type CaptureContext,
} from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";
import { resolveDocumentPathLinux } from "./document-path-linux.ts";

const execFileAsync = promisify(execFile);

// One record per player: FS between fields, RS+LF after the record, so titles
// containing tabs/newlines/pipes can't shift fields. position/length are µs.
const FS = "\x1f";
const RS = "\x1e";
const PLAYERCTL_FORMAT =
  ["playerInstance", "status", "position", "mpris:length", "xesam:url", "artist", "title"]
    .map((k) => `{{${k}}}`)
    .join(FS) + RS;

export type PlayerRecord = {
  instance: string;
  status: string; // lowercased: playing | paused | stopped
  positionSec?: number;
  durationSec?: number;
  url: string;
  artist: string;
  title: string;
};

// Exported for tests: pure parse of `playerctl -a metadata --format …` stdout.
// Short/garbled records are skipped; never throws.
export function parsePlayerctlRecords(stdout: string): PlayerRecord[] {
  const out: PlayerRecord[] = [];
  for (const rec of stdout.split(RS)) {
    const f = rec.replace(/^\n/, "").split(FS);
    if (f.length < 7 || !f[0]!.trim()) continue;
    const pos = f[2]!.trim() === "" ? NaN : Number(f[2]!) / 1e6;
    const len = f[3]!.trim() === "" ? NaN : Number(f[3]!) / 1e6;
    out.push({
      instance: f[0]!.trim(),
      status: f[1]!.trim().toLowerCase(),
      ...(Number.isFinite(pos) && pos >= 0 ? { positionSec: pos } : {}),
      ...(Number.isFinite(len) && len > 0 ? { durationSec: len } : {}),
      url: f[4]!.trim(),
      artist: f[5]!.trim(),
      title: f.slice(6).join(FS).trim(), // title is last: stray FS in it stays in it
    });
  }
  return out;
}

// ONE playerctl spawn covers every MPRIS player (was `bash -c playerctl -l`
// + 6 spawns per player). Memoized so now-playing shares the same call.
// `missing` = playerctl not installed (vs installed with no players running).
export function queryPlayers(
  ctx: CaptureContext,
): Promise<{ players: PlayerRecord[]; missing: boolean }> {
  return ctx.memo("playerctl:all", async () => {
    try {
      const { stdout } = await execFileAsync(
        "playerctl",
        ["-a", "metadata", "--format", PLAYERCTL_FORMAT],
        { timeout: 4000 },
      );
      return { players: parsePlayerctlRecords(stdout), missing: false };
    } catch (e) {
      const err = e as { code?: unknown; stdout?: unknown; stderr?: unknown };
      if (err.code === "ENOENT") return { players: [], missing: true };
      // playerctl exits 1 for "No players found" — a normal state — and may
      // still have printed records for the players that did answer.
      const partial = typeof err.stdout === "string" ? parsePlayerctlRecords(err.stdout) : [];
      if (!partial.length && !/no players/i.test(String(err.stderr ?? ""))) {
        ctx.notes.push(`linux:bgmedia:playerctl-fail:${describeExecError(e)}`);
      }
      return { players: partial, missing: false };
    }
  });
}

// Instance names look like `vlc`, `mpv`, `firefox.instance1234`.
const playerBase = (instance: string): string =>
  instance.replace(/\.instance\d+$/i, "").toLowerCase();

// Linux: every MPRIS player (playing or paused) via one playerctl call, plus
// /proc fd scans of the matching processes for on-disk paths.
export async function getBackgroundMediaLinux(
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundMediaItem[]> {
  const { players: all, missing } = await queryPlayers(ctx);
  if (missing) notes.push("linux:bgmedia:no-playerctl");
  // Browser instances are skipped: their tabs already carry titles.
  const players = all.slice(0, 6);
  const sessions: {
    appName: string;
    title: string;
    artist?: string;
    status: string;
    positionSec?: number;
    durationSec?: number;
    filePath?: string;
    path_source?: "mpris" | null;
  }[] = [];
  for (const p of players) {
    if (!p.title || (p.status !== "playing" && p.status !== "paused")) continue;
    // Free local path straight from MPRIS: file://<percent-encoded-path>.
    // Streams (http/rtsp/…) carry no file — filePath stays undefined.
    const mprisPath = mprisUrlToPath(p.url);
    sessions.push({
      appName: p.instance,
      title: p.title,
      ...(p.artist ? { artist: p.artist.slice(0, 200) } : {}),
      status: p.status === "paused" ? "Paused" : "Playing",
      ...(p.positionSec === undefined ? {} : { positionSec: p.positionSec }),
      ...(p.durationSec === undefined ? {} : { durationSec: p.durationSec }),
      ...(mprisPath && !BROWSER_HINT.test(p.instance)
        ? { filePath: mprisPath, path_source: "mpris" as "mpris" }
        : { path_source: null as null }),
    });
  }
  // playerctl gives no pids: match /proc comm names against instance names.
  // With no sessions (playerctl absent/no players) fall back to well-known
  // media player processes so an open VLC/mpv file is still found.
  const bases = new Set(players.map((p) => playerBase(p.instance)));
  const procs = await listProcesses(ctx);
  const seen = new Set<string>();
  const targets = procs
    .filter(
      ({ name }) => bases.has(name.toLowerCase()) || (sessions.length === 0 && isMediaApp(name)),
    )
    .filter(({ name }) => !BROWSER_HINT.test(name))
    .slice(0, 4);
  const hits = await Promise.all(
    targets.map(async ({ pid, name }) => {
      try {
        const hit = await resolveDocumentPathLinux(
          {
            bundleIdOrExe: name,
            appName: name,
            windowTitle: "",
            processId: pid,
            isPrivateWindow: false,
          },
          notes,
          ctx,
        );
        return hit ? { appName: name, path: hit } : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  const files: { appName: string; path: string }[] = [];
  for (const h of hits) {
    if (!h || seen.has(h.path) || files.length >= 3) continue;
    seen.add(h.path);
    files.push(h);
  }
  notes.push(`linux:bgmedia:sessions=${sessions.length}:files=${files.length}`);
  return [
    ...mergeSessionsAndFiles(
      sessions.filter((s) => !BROWSER_HINT.test(s.appName)),
      files,
    ),
    ...sessions.filter((s) => BROWSER_HINT.test(s.appName)),
  ];
}

// Exported for tests: MPRIS xesam:url -> local path (or undefined).
// file://<percent-encoded-path> decodes to a disk path; anything else
// (http/rtsp/… streams, empty) is not a file.
export function mprisUrlToPath(url: string): string | undefined {
  const u = (url ?? "").trim();
  if (!/^file:\/\//i.test(u)) return undefined;
  let path = u.replace(/^file:\/\/[^/]*/i, "");
  if (!path.startsWith("/")) path = `/${path}`;
  try {
    path = decodeURIComponent(path);
  } catch {
    // malformed % sequences — use the raw path rather than dropping it
  }
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  if (process.platform === "win32") path = path.replace(/\//g, "\\");
  return path || undefined;
}
