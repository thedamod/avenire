// Single source of truth for "which open files are worth recovering".
// Shared by all three OS scanners (Windows handle scan, macOS lsof scan,
// Linux /proc fd scan) so video/audio/docs resolve identically everywhere.
// Now-playing collectors (SMTC / Music.app / playerctl) complement this with
// titles for streams and tracks that have no on-disk file.
const VIDEO = "mp4 mkv webm avi mov m4v wmv flv ts m2ts mpg mpeg";
const AUDIO = "mp3 wav flac ogg oga opus m4a wma aac mid midi aiff alac";
const DOCS =
  "pdf docx doc pptx ppt xls xlsx md markdown txt tex rtf odt odp ods epub mobi azw cbz cbr";

export const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set(
  `${VIDEO} ${AUDIO} ${DOCS}`.split(" "),
);

// Extension-only check (no fs access): scanners confirm existence themselves.
export function isScannableFilePath(p: string): boolean {
  const m = /\.([a-z0-9]+)$/i.exec(p.trim());
  return !!m && SCANNABLE_EXTENSIONS.has(m[1]!.toLowerCase());
}

// Wider pool for TITLE matching only (Recent links, VS Code workspaces):
// the file demonstrably exists (shell link / workspace join + existsSync),
// so code and data extensions are safe to attribute by exact basename.
// Never used for blind handle-scan filtering — that stays scannable-only.
const MATCHABLE_EXTRA = new Set(
  "json jsonc ts tsx jsx js mjs py r rb java c h hpp cpp cs go rs php swift kt kts xml yml yaml toml ini cfg log csv sql sh ps1 bat".split(
    " ",
  ),
);

export function isMatchableFilePath(p: string): boolean {
  if (isScannableFilePath(p)) return true;
  const m = /\.([a-z0-9]+)$/i.exec(p.trim());
  return !!m && MATCHABLE_EXTRA.has(m[1]!.toLowerCase());
}

// Prose-only gate for the (currently parked) VS Code family: notebooks +
// markdown auto-capture; code files ride a future manual force-ingest.
// Dormant today — no in-catalog app matches PROSE_ONLY_APPS — kept so a
// catalog revival doesn't silently start sweeping code. See
// docs/IMPROVEMENTS.md (parked code editors).
const PROSE_ONLY_APPS = /^(code|visual studio code|code - insiders|cursor|windsurf|vscodium)$/i;
const PROSE_EXT = new Set(["md", "markdown", "ipynb"]);

export function isAutoCapturableFile(appName: string, filePath: string): boolean {
  if (!PROSE_ONLY_APPS.test(appName.trim())) return true;
  const m = /\.([a-z0-9]+)$/i.exec(filePath.trim());
  return !!m && PROSE_EXT.has(m[1]!.toLowerCase());
}
