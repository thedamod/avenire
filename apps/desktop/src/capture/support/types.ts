// Single source of truth for the observer stage.
// Observer does NOT upload, ingest, embed, or call Firecrawl/Cobalt.
// It turns device context into a readable CaptureDecision[] for later stages.

export type OsSelectionSource = "AX" | "UIA" | "ATSPI" | "clipboard-fallback" | "none";

export type OsSelection = {
  text: string;
  source: OsSelectionSource;
};

export type DeviceInfo = {
  deviceId: string; // hashed machine id, never raw serial
  platform: NodeJS.Platform;
  arch: string;
};

export type ForegroundApp = {
  bundleIdOrExe: string; // e.g. com.google.Chrome, chrome.exe, org.mozilla.firefox
  appName: string; // e.g. "Chrome", "Preview", "Obsidian", "vlc"
  windowTitle: string; // raw foreground window title
  processId?: number;
  isPrivateWindow: boolean; // incognito/private — set by extension or heuristics; if unknown, assume false only for non-browser apps
  documentPath?: string; // resolved local file path for PDF/Office/Obsidian/media, if any
  mediaPositionSec?: number; // seek position, when the OS reports a timeline (SMTC/playerctl)
  mediaDurationSec?: number; // total duration, same source; progress = position/duration
};

export type TabEngagement = {
  dwellMs: number;
  scrollDepthPct: number; // 0-100
  mediaPlaying: boolean;
};

export type BrowserTab = {
  tabId: string;
  windowId: string;
  windowFocused: boolean;
  activeInWindow: boolean;
  url: string;
  title: string;
  incognito: boolean;
  selectionText?: string; // selection scoped to this tab, trimmed, max ~5000 chars
  engagement: TabEngagement;
  // Which extension sender reported this tab (profile × browser). The app
  // merges senders; this field preserves provenance for debugging.
  via?: { senderId: string; browser: string };
  // True when the browser discarded the tab (Memory Saver) — content scripts
  // can't run there, so engagement reads zero through no fault of the user.
  discarded?: boolean;
  // Redirect-aware capture (extension webNavigation tracking): url is the
  // committed address; finalUrl is the post-redirect landing URL and
  // originUrl the pre-redirect request URL when they differ. The browser
  // cache is keyed by the URL actually fetched, so CacheCapture tries all
  // three before falling back.
  finalUrl?: string;
  originUrl?: string;
  // Extension hint: tab looks like a PDF/document (URL/title match), so the
  // cache pass should try it first without scanning every article page.
  likelyPdf?: boolean;
};

export type RawSnapshot = {
  snapshotId: string;
  capturedAt: string; // ISO timestamp, set the instant hotkey fires
  hotkeyId: string;
  device: DeviceInfo;
  foreground: ForegroundApp;
  // Outside-browser selection (a11y API or clipboard-copy fallback). Extension selection arrives via tabs.
  osSelection?: OsSelection;
  tabs: BrowserTab[]; // all tabs from focused browser window; [] if foreground is not a browser or extension offline
  extensionConnected: boolean;
  // Background media (paused/playing lecture while notes are in front).
  // Collected by electron/collectors/background-media.ts; empty when
  // unsupported, denied, or nothing is loaded anywhere.
  backgroundMedia?: BackgroundMediaItem[];
  // Visible background windows (non-browser; tabs already cover browsers).
  // Titles always; files only where precisely resolvable (Office docs).
  // Media players are covered by backgroundMedia instead.
  backgroundWindows?: BackgroundWindow[];
  // Open editor tabs with known files (Obsidian vault leaves; code editors
  // parked — resolvers frozen in parked/editors/, see docs/IMPROVEMENTS.md).
  editorTabs?: { appName: string; filePath: string }[];
  // Collector self-report: why a path/selection is missing (scan counts,
  // denied handles, timeouts). Rendered into last-capture.json for diagnosis.
  collectorNotes?: string[];
};

// Media playing or paused in a BACKGROUND app (notes in front, lecture
// behind). Paused counts: a paused lecture is still study context.
// Collected per-OS (Windows SMTC sessions, Linux playerctl, macOS ps+lsof);
// each item becomes a rank-2 app-document candidate like foreground docs.
export type BackgroundMediaItem = {
  appName: string;
  title: string; // SMTC/player title, or file basename when only a path is known
  artist?: string; // separate artist field — never merged into title ("Artist - Title")
  filePath?: string; // on-disk file, when the OS exposes one (streams have none)
  // How filePath was obtained. Must be null when filePath is null.
  path_source?: "mpris" | "ipc" | "handle-scan" | "mru" | "title-heuristic" | null;
  status?: string; // 'Playing' | 'Paused' | …, when the OS reports it
  positionSec?: number; // seek position, when the OS reports a timeline
  durationSec?: number; // total duration, same source
};

// A visible non-foreground window: app + title always, file only when an
// OS source resolves it precisely (e.g. Word/Excel/PowerPoint open docs).
export type BackgroundWindow = {
  appName: string;
  windowTitle: string;
  filePath?: string;
};

// One thing the user is plausibly engaging with.
export type Candidate = {
  kind: "selection" | "app-document" | "browser-tab" | "local-file";
  sourceUrl?: string;
  windowTitle?: string;
  appName?: string;
  selectionText?: string;
  filePath?: string;
  tabRef?: Pick<BrowserTab, "tabId" | "title" | "url" | "engagement">;
  // Which app this candidate belongs to (foreground for P2, the owning app
  // for background media). observe.ts routes off this instead of assuming
  // every non-URL candidate comes from the foreground app.
  appRef?: { appName: string; documentPath?: string };
  mediaPositionSec?: number; // seek position carried from fg/bg timeline
  mediaDurationSec?: number; // total duration, same source
  reason: string; // why it became a candidate, for debug/toast transparency
};

export type RouteKind =
  | "paper-direct" // arXiv/SemSch/OpenReview/ACL/PubMed/PMC/bioRxiv/medRxiv
  | "cobalt-capable" // youtube/vimeo/reddit/x/soundcloud etc.
  | "direct-file" // http(s) ... .pdf/.docx/.md/audio in browser
  | "firecrawl" // generic article/blog/wiki/docs
  | "client-extraction" // Google Docs/Slides/Notion/Overleaf/Canvas/Moodle/Classroom/paywall/login — rendered-text/download via user session
  | "local-file-upload"; // pdf reader/office/obsidian/media player/file manager

export type CaptureDecision = {
  id: string;
  kind: Candidate["kind"];
  title: string;
  sourceUrl?: string;
  selectionText?: string; // only when kind === 'selection'
  filePath?: string; // only for local files
  appName?: string;
  mediaPositionSec?: number; // seek position, when a timeline was reported
  mediaDurationSec?: number; // total duration, same source
  route: RouteKind;
  needsClientExtraction: boolean;
  routeReason: string;
  priorityRank: 1 | 2 | 3 | 4; // 1=selection, 2=foreground doc, 3=active tab, 4=other engaged tab
  dedupeKey: string; // stable key used for dedupe + "already in Avenire" check later
  blocked?: false;
};

export type BlockedCandidate = {
  blocked: true;
  reason: string;
  matchedRule: string;
  candidate: Candidate;
};

export type CaptureResult = {
  snapshot: RawSnapshot;
  decisions: CaptureDecision[]; // ready for inbox/toast; upload/ingest stages consume this
  droppedAsBlocked: BlockedCandidate[];
  droppedAsDuplicate: Candidate[];
  // Tabs seen but not captured, WITH reasons (idle, background window).
  // Nothing downstream may drop silently — the toast summarizes the count,
  // last-capture.json carries the full list.
  skippedAsIdle: { reason: string; url?: string; title?: string }[];
};
