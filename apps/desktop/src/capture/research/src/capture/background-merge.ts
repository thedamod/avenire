import type { BackgroundMediaItem } from "./types.ts";

// Match sessions and paths only within the same player family. Ambiguous files remain
// separate sources instead of borrowing another session's title or playback position.
export function mergeSessionsAndFiles(
  sessions: Array<BackgroundMediaItem & { status: string }>,
  files: Array<{ appName: string; path: string }>,
): BackgroundMediaItem[] {
  const items: BackgroundMediaItem[] = sessions.map((session) => ({
    ...session,
    path_source: session.filePath ? (session.path_source ?? "mpris") : null,
  }));
  const knownPaths = new Set(items.flatMap((item) => (item.filePath ? [item.filePath] : [])));
  for (const file of files) {
    if (knownPaths.has(file.path)) continue;
    const matches = items.filter(
      (item) => !item.filePath && samePlayer(item.appName, file.appName),
    );
    const peers = files.filter((other) => samePlayer(file.appName, other.appName));
    const stem = mediaBasename(file.path)
      .replace(/\.[a-z0-9]+$/i, "")
      .toLowerCase();
    const named = matches.filter(
      (item) => stem.length >= 4 && item.title.toLowerCase().includes(stem),
    );
    const match =
      named.length === 1
        ? named[0]
        : matches.length === 1 && peers.length === 1
          ? matches[0]
          : undefined;
    if (match) Object.assign(match, { filePath: file.path, path_source: "handle-scan" });
    else
      items.push({
        appName: file.appName,
        title: mediaBasename(file.path),
        filePath: file.path,
        path_source: "handle-scan",
      });
    knownPaths.add(file.path);
  }
  return items;
}

export function mediaBasename(p: string): string {
  return p.split(/[\\/]/).pop()?.trim() || p;
}

// "45:48 / 1:14:03 (61%)" — empty string when no timeline. Pure.
export function formatMediaProgress(positionSec?: number, durationSec?: number): string {
  if (positionSec == null || durationSec == null || !(durationSec > 0) || positionSec < 0)
    return "";
  const pct = Math.round((Math.min(positionSec, durationSec) / durationSec) * 100);
  return `${formatHMS(positionSec)} / ${formatHMS(durationSec)} (${pct}%)`;
}

function formatHMS(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

function samePlayer(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\.exe$/, "")
      .replace(/[ ._-]/g, "");
  if (normalize(a) === normalize(b)) return true;
  return (
    /^(?:mediaplayer|microsoftmediaplayer|windowsmediaplayer|wmplayer|groovemusic|musicui|films&tv|videoui)$/.test(
      normalize(a),
    ) &&
    /^(?:mediaplayer|microsoftmediaplayer|windowsmediaplayer|wmplayer|groovemusic|musicui|films&tv|videoui)$/.test(
      normalize(b),
    )
  );
}
