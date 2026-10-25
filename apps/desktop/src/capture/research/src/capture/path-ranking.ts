// Ranks raw open-file paths (Windows handle scan, Linux /proc fd readlink,
// macOS lsof) so the pick is the file the STUDENT opened, not an asset the
// app itself holds open (license.txt in Program Files, a bundled readme/font
// beside a player, a cached .mp4 in AppData\Local\Temp).
// Pure + cross-platform: Windows-shaped and POSIX paths are told apart by
// shape, not host OS, so every scanner (and the unit tests) share one ranker.
import { isScannableFilePath } from "./scannable-files.ts";

// --- shape ---------------------------------------------------------------

// WSL exposes drives as /mnt/c/... — classify those exactly like C:\... so a
// WSL-hosted capture of Windows files ranks the same as a native one.
const WSL_DRIVE = /^\/mnt\/([a-z])(?:\/(.*))?$/i;
const WIN_DRIVE = /^[a-z]:[\\/]/i;

interface Norm {
  win: boolean;
  p: string;
} // p: win => backslashes, no \\?\ prefix

function normalize(raw: string): Norm {
  let s = raw.trim();
  const wsl = WSL_DRIVE.exec(s);
  if (wsl)
    return { win: true, p: `${wsl[1]!.toUpperCase()}:\\${(wsl[2] ?? "").replace(/\//g, "\\")}` };
  // \\?\C:\x and \\?\UNC\srv\share are extended-length spellings of the same.
  if (/^\\\\\?\\UNC\\/i.test(s)) s = "\\\\" + s.slice(8);
  else if (s.startsWith("\\\\?\\") || s.startsWith("\\\\.\\")) s = s.slice(4);
  if (WIN_DRIVE.test(s) || s.startsWith("\\\\")) return { win: true, p: s.replace(/\//g, "\\") };
  return { win: false, p: s };
}

// --- drop rules (app assets / system / caches) -----------------------------

// Windows: matched against the lowercased backslash path with a leading '\'
// guaranteed, so `\windows\` hits `C:\Windows\...` on ANY drive letter
// without matching `C:\Users\x\Windows Notes\`.
const WIN_DROP: RegExp[] = [
  /\\windows\\/,
  /\\program files( \(x86\))?\\/,
  /\\programdata\\/,
  /\\appdata\\local\\temp\\/,
  /\\appdata\\local\\microsoft\\/, // INetCache, WinGet, Edge/Teams caches, WindowsApps
  /\\appdata\\local\\packages\\[^\\]+\\(localstate|tempstate|ac|localcache|roamingstate|systemappdata)\\/,
  /\\appdata\\local\\programs\\/, // per-user installs (Spotify, VS Code, ...)
  /\\\$recycle\.bin\\/,
  /\\system volume information\\/,
  /\\node_modules\\/,
  /\\site-packages\\/,
];

// POSIX: matched against the exact path. Home-relative rules use a captured
// home prefix so `/home/x/.cache/` and `/root/.cache/` both match.
const POSIX_DROP: RegExp[] = [
  /^\/(usr|opt|snap|proc|dev|sys|etc|lib|lib32|lib64|bin|sbin|boot|srv)\//,
  /^\/var\/(lib|cache|log|snap)\//,
  // /run is sockets/tmpfs EXCEPT removable media and the xdg-document-portal
  // (/run/user/UID/doc/ — how Flatpak/Snap apps see files the user picked).
  /^\/run\/(?!media\/|user\/\d+\/(doc|gvfs)\/)/,
  /^\/tmp\/\.mount_/, // AppImage squashfs mount = the app's own assets
  /^\/(System|Library|Applications)\//, // macOS system-wide (NOT ~/Library)
  /^\/private\/(etc|var\/db|var\/log|var\/folders\/[^/]+\/[^/]+\/C\/)/,
  /^\/(?:var\/)?(?:home|Users)\/[^/]+\/\.cache\//,
  /^\/root\/\.cache\//,
  /\/\.local\/share\/(Trash|flatpak)\//,
  /\/\.local\/lib\//,
  /\/\.var\/app\/[^/]+\/(cache|config)\//,
  /\/\.Trash\//, // macOS ~/.Trash
  /\/\.(npm|nvm|cargo|rustup|pyenv|conda|gradle|m2)\//,
  /\/(miniconda3|anaconda3)\//,
  // Anchored to the home: the Mail Downloads path contains a second /Library/.
  /^\/Users\/[^/]+\/Library\/(?!Mobile Documents\/|CloudStorage\/|Containers\/[^/]+\/Data\/(Documents|Library\/Mail Downloads)\/)/,
  /\.app\/Contents\//i,
  /\/node_modules\//,
  /\/(site|dist)-packages\//,
  /\/\.git\//,
];

// /proc readlink decorations and pseudo-files: never real documents.
function isPseudo(s: string): boolean {
  return / \(deleted\)$/.test(s) || /^memfd:/.test(s) || /^(anon_inode|socket|pipe):/.test(s);
}

function dropped(n: Norm): boolean {
  if (n.win) {
    const l = ("\\" + n.p.toLowerCase()).replace(/^\\\\\\/, "\\\\"); // keep UNC '\\' prefix sane
    return WIN_DROP.some((r) => r.test(l));
  }
  return POSIX_DROP.some((r) => r.test(n.p));
}

// --- tiering ------------------------------------------------------------------

// First home-relative segment that marks "the user put this here on purpose".
const DOC_ROOT =
  /^(documents|my documents|desktop|downloads|videos|my videos|movies|music|my music|pictures|my pictures|onedrive.*|icloud.*|dropbox.*|google ?drive.*|my drive|nextcloud.*|owncloud.*|mega.*|sync)$/i;
// Cloud roots count even outside a home (Drive for desktop mounts G:\My Drive).
const CLOUD_ROOT =
  /^(onedrive.*|icloud.*|dropbox.*|google ?drive.*|my drive|nextcloud.*|owncloud.*)$/i;

const WIN_HOME = /^[a-z]:\\users\\([^\\]+)\\(.*)$/i;
const POSIX_HOME = /^(?:\/var)?\/(?:home|Users)\/([^/]+)\/(.*)$|^\/(root)\/(.*)$/;

// 0 doc roots, 1 other under a home, 2 other drives/mounts, 3 app-data/hidden/ephemeral.
function tier(n: Norm): number {
  if (n.win) {
    const m = WIN_HOME.exec(n.p);
    if (m) {
      const segs = m[2]!.split("\\");
      if (/^appdata$/i.test(segs[0]!) || segs[0]!.startsWith(".")) return 3;
      return DOC_ROOT.test(segs[0]!) ? 0 : 1;
    }
    const rest = n.p.replace(/^[a-z]:\\/i, "").split("\\");
    return CLOUD_ROOT.test(rest[0]!) ? 0 : 2;
  }
  const m = POSIX_HOME.exec(n.p);
  if (m) {
    const rel = m[2] ?? m[4] ?? "";
    const segs = rel.split("/");
    // iCloud Drive + modern macOS cloud providers (Dropbox, Drive, OneDrive).
    if (/^Library$/.test(segs[0]!)) {
      if (segs[1] === "Mobile Documents" || segs[1] === "CloudStorage") return 0;
      return 1; // sandbox Documents / Mail Downloads that survived the drop rules
    }
    if (segs[0]!.startsWith(".")) return 3;
    return DOC_ROOT.test(segs[0]!) ? 0 : 1;
  }
  // /tmp is where mail clients and viewers stage attachments the user opened
  // (kept, last); apps never install there, and /tmp/.mount_* is dropped above.
  if (/^\/(tmp|var\/tmp|private\/tmp|private\/var\/folders|dev\/shm)\//.test(n.p)) return 3;
  return 2; // /media, /mnt, /run/media, /Volumes, NFS, ...
}

// --- public ------------------------------------------------------------------

export function rankCandidatePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const buckets: string[][] = [[], [], [], []];
  for (const raw of paths) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s || isPseudo(s) || !isScannableFilePath(s)) continue;
    const n = normalize(s);
    if (dropped(n)) continue;
    const key = n.win ? n.p.toLowerCase() : n.p; // NTFS is case-insensitive; POSIX is not
    if (seen.has(key)) continue;
    seen.add(key);
    buckets[tier(n)]!.push(s);
  }
  return buckets.flat();
}

// Among ranked candidates, prefer the one the window title names ("Essay.docx
// - Word", "lecture3 — mpv"); otherwise the top-ranked path. A title hit
// beats rank because it is direct evidence of WHICH open file is on screen.
export function pickBestPath(ranked: string[], windowTitle?: string): string | undefined {
  if (ranked.length <= 1 || !windowTitle) return ranked[0];
  const t = windowTitle.toLowerCase();
  const hit = ranked.find((p) => {
    const base = (p.split(/[\\/]/).pop() ?? "").toLowerCase();
    const stem = base.replace(/\.[a-z0-9]+$/, "");
    return (base.length > 0 && t.includes(base)) || (stem.length >= 4 && t.includes(stem));
  });
  return hit ?? ranked[0];
}
