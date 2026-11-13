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
  /vlc|mpv|mplayer|mpc|wmplayer|groove|music\.ui|quicktime|itunes|^music$|totem|rhythmbox|potplayer|kmplayer|kodi|plex|jellyfin|video\.ui|^gom$|microsoft\.media\.player|windows[ ._-]*media|media[ ._-]*player|audacious|celluloid|haruna|elisa|iina|films\s*&\s*tv|movies\s*&\s*tv/i;

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
// Document/media allowlist, adapted from v1. Browsers belong to the extension;
// file managers, system UI, launchers, terminals and IDEs never qualify.
// Notepad++ is limited to .md/.txt by native-file.ts. Every app also needs a resolved file.
export const LOCAL_FILE_APPS =
  /^(?:preview|acrobat(?: reader)?|acrord32|adobe acrobat(?: reader)?|sumatrapdf|okular|evince|zathura|foxit(?:pdfreader|reader|phantompdf| pdf reader)?|winword|(?:microsoft )?word|(?:microsoft )?excel|powerpnt|(?:microsoft )?powerpoint|(?:microsoft )?onenote|pages|numbers|keynote|libreoffice(?:[ -](?:writer|calc|impress))?|soffice(?:\.bin)?|obsidian|typora|notepad\+\+|vlc(?: media player)?|quicktime(?: ?player)?|iina|mpv(?:-bundle)?|mplayer|mpc(?:-hc|-be|hc|be)?(?:64)?|wmplayer|windows media player|media player|microsoft\.media\.player|music\.ui|video\.ui|groove ?music|films ?& ?tv|movies ?& ?tv|potplayer(?:mini)?(?:64)?|calibre|ebook-viewer|zotero)$/i;
export function isLocalFileApp(name: string): boolean {
  return LOCAL_FILE_APPS.test(name.trim().replace(/\.exe$/i, ""));
}

// ---- Code editors ----
// (intentionally empty — filled in by the editors work)
