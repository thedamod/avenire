// The ONE place app names live. Every "is this app a media player / browser /
// Office / ourselves / a local-file target" question is answered here —
// collectors used to carry their own copy-pasted regexes that drifted apart
// (Linux knew audacious, Windows knew whale, neither knew both). To teach the
// capture agent a new app, add its process/display name to the matching
// regex below and add a case to tests/app-catalog.test.ts; do not define a
// new app regex in a collector.
//
// Matched against: win32 exe basename without .exe, linux /proc comm, macOS
// display name / bundle name. Regexes are case-insensitive. Anchored (^...$)
// entries exist because the bare word is also a substring of unrelated
// names ("music" in "MusicBrainz Picard", "gom" in "gomplayer-helper").

// ---- Media players ----
// Unanchored substring hints, except the ^...$ ones. Union of the former
// now-playing hint, the win/mac/linux background-window lists (linux extras:
// audacious|celluloid|haruna|elisa).
// NOTE: the Win11 Media Player runs as Microsoft.Media.Player (NOT Video.UI —
// that's the old Films & TV app); Groove's process is Music.UI.
export const MEDIA_APP =
  /vlc|mpv|mplayer|mpc|wmplayer|groove|music\.ui|quicktime|itunes|^music$|totem|rhythmbox|potplayer|kmplayer|kodi|plex|jellyfin|video\.ui|^gom$|microsoft\.media\.player|windows[ ._-]*media|media[ ._-]*player|audacious|celluloid|haruna|elisa/i;

// appName, or (optionally) bundle id / exe path-ish string, looks like a player.
export function isMediaApp(appName: string, exe = ""): boolean {
  return MEDIA_APP.test(appName) || (exe ? MEDIA_APP.test(exe) : false);
}

// ---- Browsers ----
// Exact process / comm / display names across OSes (win exe, linux comm,
// mac "Google Chrome" / "Microsoft Edge" / "Brave Browser"). Anchored: a
// process named "chrome-remote-desktop" or an app "Archive Utility" is not
// a browser. Browsers are owned by the tab pipeline (extension), so
// window/media collectors skip them.
export const BROWSER_APP =
  /^(chrome|chromium|google chrome|msedge|microsoft edge|firefox|brave|brave browser|opera|vivaldi|whale|helium|safari|arc)$/i;

// Unanchored variant for strings that merely CONTAIN a browser id: SMTC
// AUMIDs ("Chrome.XXXX", "MSEdge") and playerctl instances
// ("chromium.instance123", "firefox.instance_1_42"). "arc" is deliberately
// absent here — as a substring it matches far too much.
export const BROWSER_HINT =
  /chrome|chromium|msedge|firefox|brave|opera|vivaldi|whale|helium|safari/i;

export function isBrowserApp(name: string): boolean {
  return BROWSER_APP.test(name);
}

// ---- Office ----
// Office owns its own resolution (COM on Windows); re-matching its windows by
// Recent or pid-scan would double-list or misattribute shared-process docs.
export const OFFICE_APP = /^(winword|excel|powerpnt)$/i;

export function isOfficeApp(name: string): boolean {
  return OFFICE_APP.test(name);
}

// ---- This app ----
// Never list ourselves as a background window.
export const SELF_APP = /^(avenire|electron|capture)$/i;

export function isSelfApp(name: string): boolean {
  return SELF_APP.test(name);
}

// ---- Local-file targets ----
// Apps whose document path we resolve to a local file upload.
// Scope: PDFs, Office documents, notes, media, file managers — NOT code.
// Code editors (VS Code family, JetBrains family, Sublime, vim/emacs, Zed,
// Atom, Notepad++, devenv, Xcode) are parked: resolvers live frozen in
// parked/editors/, revival tracked in docs/IMPROVEMENTS.md.
// Names verified against real process tables (Sep 2026):
// - Office (MS Support): WINWORD.EXE, EXCEL.EXE, POWERPNT.EXE, PPTVIEW.EXE,
//   MSACCESS.EXE, VISIO.EXE, WINPROJ.EXE; mac display "Microsoft Word/Excel/…"
// - LibreOffice: soffice.bin (the real process, not soffice.exe wrapper)
// - Reader 64-bit unified: Acrobat.exe; 32-bit Reader: AcroRd32.exe
// - Foxit: FoxitPDFReader.exe (new) / FoxitReader.exe (old)
// - Groove: Music.UI.exe / GrooveMusic.exe; Win11 player: Microsoft.Media.Player.exe
// - Plain-text notes editors: gedit/kate/kwrite, Notepad, TextEdit
// - New Outlook is Olk.exe (email — must NOT match; it was a leak), Code.exe
//   is VS Code (an editor, not a local-file target here)
export const LOCAL_FILE_APPS =
  /preview|acrobat|acrord32|sumatra|okular|evince|zathura|foxit|winword|\bword\b|excel|powerpnt|powerpoint|pptview|msaccess|visio|winproj|pages|keynote|libreoffice|soffice|obsidian|vlc|quicktime|mpv|mplayer|mpc|wmplayer|windows[ ._-]*media|media[ ._-]*player|music\.ui|groovemusic|^groove$|totem|rhythmbox|potplayer|kmplayer|kodi|plex|jellyfin|video\.ui|^gom$|itunes|^music$|^notepad$|textedit|gedit|kate|kwrite|finder|explorer|nautilus|dolphin/i;

export function isLocalFileApp(name: string): boolean {
  return LOCAL_FILE_APPS.test(name);
}

// ---- Code editors ----
// (intentionally empty — filled in by the editors work)
