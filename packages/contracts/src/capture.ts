/**
 * Capture - what the desktop hotkey observed, before policy, extraction or upload.
 *
 * A snapshot is immutable provenance: it records what was on screen when the
 * hotkey fired. Turning it into inbox files is a separate, idempotent step keyed
 * by each candidate's `dedupeKey`.
 */
import * as Schema from "effect/Schema";

import { CaptureId, FileId } from "./ids.ts";

const Url = Schema.String.check(Schema.isMaxLength(8192));
const Title = Schema.String.check(Schema.isMaxLength(2000));
const Identifier = Schema.NonEmptyString.check(Schema.isMaxLength(200));
const Timestamp = Schema.String.check(Schema.isMaxLength(64));
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/));
const ScrollPct = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }));

export const TextQuote = Schema.Struct({
  exact: Schema.NonEmptyString.check(Schema.isMaxLength(500)),
  prefix: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  suffix: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
});
export type TextQuote = typeof TextQuote.Type;

export const CapturePosition = Schema.Struct({
  scrollPct: Schema.optional(ScrollPct),
  textQuote: Schema.optional(TextQuote),
  pdfPage: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  mediaSec: Schema.optional(NonNegative),
});
export type CapturePosition = typeof CapturePosition.Type;

export const BrowserKind = Schema.Literals([
  "chrome",
  "edge",
  "brave",
  "arc",
  "vivaldi",
  "opera",
  "firefox",
  "other",
]);
export type BrowserKind = typeof BrowserKind.Type;

export const CaptureOrigin = Schema.Union([
  Schema.TaggedStruct("Web", {
    url: Url,
    finalUrl: Schema.optional(Url),
    canonicalUrl: Schema.optional(Url),
    title: Title,
    browser: BrowserKind,
    capturedAt: Timestamp,
    position: Schema.optional(CapturePosition),
  }),
  Schema.TaggedStruct("LocalFile", {
    deviceId: Identifier,
    deviceName: Schema.String.check(Schema.isMaxLength(255)),
    platform: Schema.Literals(["darwin", "win32", "linux"]),
    /** Original browser page for downloaded local files; device paths still stay local. */
    originUrl: Schema.optional(Url),
    /** Basename only: absolute paths stay in the desktop's local origin registry. */
    fileName: Schema.NonEmptyString.check(Schema.isMaxLength(255)),
    appName: Schema.optional(Schema.String.check(Schema.isMaxLength(255))),
    sizeBytes: NonNegativeInt,
    sha256: Sha256,
    capturedAt: Timestamp,
    position: Schema.optional(CapturePosition),
  }),
]);
export type CaptureOrigin = typeof CaptureOrigin.Type;

/** Whether the student could reach the source. Extraction coverage is tracked separately. */
export const SourceAccess = Schema.Literals(["open", "paywalled", "login-required"]);
export type SourceAccess = typeof SourceAccess.Type;

export const AccessSignals = Schema.Struct({
  httpStatus: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 100, maximum: 599 }))),
  isAccessibleForFree: Schema.optional(Schema.Boolean),
  visibleTextLength: NonNegativeInt,
  articleWordCount: Schema.optional(NonNegativeInt),
  paywallContainers: Schema.Array(Schema.String.check(Schema.isMaxLength(100))).check(
    Schema.isMaxLength(32),
  ),
  passwordInput: Schema.Boolean,
});
export type AccessSignals = typeof AccessSignals.Type;

export const PageSnapshot = Schema.Struct({
  tabId: NonNegativeInt,
  url: Url,
  title: Title,
  canonicalUrl: Schema.optional(Url),
  description: Schema.String.check(Schema.isMaxLength(5000)),
  abstract: Schema.optional(Schema.String.check(Schema.isMaxLength(10000))),
  language: Schema.String.check(Schema.isMaxLength(35)),
  text: Schema.String.check(Schema.isMaxLength(1_500_000)),
  textLength: NonNegativeInt,
  truncated: Schema.Boolean,
  signals: AccessSignals,
  /** Desktop-connected only: browser download; never forwarded as server metadata. */
  download: Schema.optional(
    Schema.Struct({
      path: Schema.String.check(Schema.isMaxLength(32768)),
      captureId: Identifier,
      mimeType: Schema.String.check(Schema.isMaxLength(255)),
      sizeBytes: NonNegativeInt,
      url: Url,
      originUrl: Schema.optional(Url),
      primary: Schema.optional(Schema.Boolean),
    }),
  ),
  /**
   * The original file (PDF, Office document) read with the browser session. Its bytes follow as
   * binary frames on the same socket, or go straight to the upload API in direct mode.
   */
  file: Schema.optional(
    Schema.Struct({
      url: Url,
      /** The tab itself is this document; excluded from discovered-link counts. */
      primary: Schema.optional(Schema.Boolean),
      /** HTTP(S) frame containing this document, when discovered in an embedded viewer. */
      originUrl: Schema.optional(Url),
      fileName: Schema.String.check(Schema.isMaxLength(255)),
      mimeType: Schema.String.check(Schema.isMaxLength(255)),
      sizeBytes: NonNegativeInt,
      sha256: Sha256,
    }),
  ),
});
export type PageSnapshot = typeof PageSnapshot.Type;

export const ReopenPlan = Schema.Union([
  Schema.TaggedStruct("FocusTab", { url: Url, position: Schema.optional(CapturePosition) }),
  Schema.TaggedStruct("OpenUrl", { url: Url }),
  /** The desktop resolves `fileId` through its local origin registry; no path crosses the wire. */
  Schema.TaggedStruct("OpenLocal", {
    fileId: FileId,
    fileName: Schema.String.check(Schema.isMaxLength(255)),
    appName: Schema.optional(Schema.String.check(Schema.isMaxLength(255))),
    position: Schema.optional(CapturePosition),
  }),
  Schema.TaggedStruct("OpenInLibrary", {
    fileId: FileId,
    position: Schema.optional(CapturePosition),
  }),
]);
export type ReopenPlan = typeof ReopenPlan.Type;

export const TabEngagement = Schema.Struct({
  dwellMs: NonNegative,
  scrollDepthPct: ScrollPct,
  mediaPlaying: Schema.Boolean,
});
export type TabEngagement = typeof TabEngagement.Type;

export const CapturedTab = Schema.Struct({
  tabId: NonNegativeInt,
  windowId: NonNegativeInt,
  browser: BrowserKind,
  selection: Schema.optional(TextQuote),
  position: Schema.optional(CapturePosition),
  url: Url,
  finalUrl: Schema.optional(Url),
  title: Title,
  activeInWindow: Schema.Boolean,
  incognito: Schema.optional(Schema.Boolean),
  selectionText: Schema.optional(Schema.String.check(Schema.isMaxLength(5000))),
  likelyPdf: Schema.optional(Schema.Boolean),
  engagement: TabEngagement,
  /**
   * Set when the page was read in the browser and the student is blocked too. The server applies
   * `paywalledPages` and keeps `summary` (description or abstract) for a title-abstract stub.
   */
  access: Schema.optional(SourceAccess),
  summary: Schema.optional(Schema.String.check(Schema.isMaxLength(10000))),
});
export type CapturedTab = typeof CapturedTab.Type;

export const CapturedMedia = Schema.Struct({
  appName: Schema.String,
  title: Title,
  url: Schema.optional(Schema.String),
  filePath: Schema.optional(Schema.String),
  positionSec: Schema.optional(NonNegative),
  durationSec: Schema.optional(NonNegative),
});
export type CapturedMedia = typeof CapturedMedia.Type;

export const CapturedWindow = Schema.Struct({
  appName: Schema.String,
  title: Title,
  filePath: Schema.optional(Schema.String),
  foreground: Schema.Boolean,
});
export type CapturedWindow = typeof CapturedWindow.Type;

export const CaptureSnapshot = Schema.Struct({
  id: CaptureId,
  /** ISO timestamp taken the instant the hotkey fired. */
  capturedAt: Schema.String,
  /** Hashed, stable per-install device identifier. */
  deviceId: Schema.String,
  platform: Schema.Literals(["darwin", "win32", "linux"]),
  windows: Schema.Array(CapturedWindow),
  tabs: Schema.Array(CapturedTab),
  media: Schema.Array(CapturedMedia),
  selectionText: Schema.optional(Schema.String.check(Schema.isMaxLength(5000))),
  /** Why a collector could not report something (denied permission, timeout, ...). */
  collectorNotes: Schema.Array(Schema.String),
});
export type CaptureSnapshot = typeof CaptureSnapshot.Type;

/**
 * Categories that are never captured, whatever the user's allowlist says.
 * Policy runs before extraction so blocked content never leaves the device.
 */
export const BlockedCategory = Schema.Literals([
  "email",
  "banking",
  "messaging",
  "password-manager",
  "checkout",
  "social-feed",
  "drm-stream",
  "private-window",
]);
export type BlockedCategory = typeof BlockedCategory.Type;

const Version = Schema.Literal(1);
const RequestId = Identifier;
/**
 * How an extension proves it belongs to the desktop's signed-in owner. `Token` is the per-user
 * pairing token both sides fetch from Avenire with their own session; `Code` is the 6-digit code
 * the desktop shows when the browser isn't signed in; `Secret` is what `Welcome` issued earlier.
 */
export const ExtensionAuth = Schema.Union([
  Schema.TaggedStruct("Token", {
    token: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  }),
  Schema.TaggedStruct("Code", { code: Schema.String.check(Schema.isPattern(/^\d{6}$/)) }),
  Schema.TaggedStruct("Secret", {
    secret: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  }),
]);
export type ExtensionAuth = typeof ExtensionAuth.Type;

/**
 * `GET /api/capture/pairing`: the owner's pairing token plus their `captureLoggedInPages`, so an
 * extension capturing without the desktop applies the same read-in-browser choice.
 */
export const CapturePairing = Schema.Struct({
  token: ExtensionAuth.members[0].fields.token,
  readInBrowser: Schema.Boolean,
});
export type CapturePairing = typeof CapturePairing.Type;
export const ExtensionMessage = Schema.Union([
  Schema.TaggedStruct("Hello", {
    version: Version,
    senderId: Identifier,
    browser: BrowserKind,
    extensionVersion: Schema.String.check(Schema.isMaxLength(32)),
    auth: ExtensionAuth,
  }),
  /** Desktop → extension once `Hello` is accepted; `secret` replaces a code for later sessions. */
  Schema.TaggedStruct("Welcome", {
    version: Version,
    secret: Schema.optional(ExtensionAuth.members[2].fields.secret),
  }),
  /** Desktop → extension when `Hello` is rejected; the socket closes after it. */
  Schema.TaggedStruct("Rejected", {
    version: Version,
    reason: Schema.Literals(["unpaired", "account-mismatch", "unsupported-version"]),
  }),
  /** Desktop asks the paired extension to refresh metadata before choosing tabs to read. */
  Schema.TaggedStruct("TabsRequest", { version: Version }),
  Schema.TaggedStruct("TabsReport", {
    version: Version,
    tabs: Schema.Array(CapturedTab).check(Schema.isMaxLength(200)),
  }),
  Schema.TaggedStruct("CaptureRequest", {
    /** Remaining milliseconds, independent of clock synchronization. */
    deadlineMs: Schema.optional(NonNegativeInt),
    version: Version,
    requestId: RequestId,
    tabIds: Schema.optional(Schema.Array(NonNegativeInt).check(Schema.isMaxLength(200))),
    /** The owner's `captureLoggedInPages`: read page text and files in the browser session. */
    readInBrowser: Schema.Boolean,
    /** Previously validated downloads eligible for reuse on this authenticated connection. */
    reusableDownloads: Schema.optional(Schema.Array(Schema.String)),
  }),
  Schema.TaggedStruct("CaptureResult", {
    /** Absent means final for v1 peers. Binary frames follow their page metadata. */
    final: Schema.optional(Schema.Boolean),
    version: Version,
    requestId: RequestId,
    pages: Schema.Array(PageSnapshot).check(Schema.isMaxLength(200)),
    skipped: Schema.Array(
      Schema.Struct({
        tabId: NonNegativeInt,
        reason: Schema.String.check(Schema.isMaxLength(500)),
      }),
    ).check(Schema.isMaxLength(200)),
  }),
  Schema.TaggedStruct("Reopen", {
    version: Version,
    requestId: RequestId,
    url: Url,
    position: Schema.optional(CapturePosition),
  }),
  Schema.TaggedStruct("ReopenResult", {
    version: Version,
    requestId: RequestId,
    ok: Schema.Boolean,
  }),
  /** Extension → desktop: the browser shortcut or popup asked for a capture; desktop runs it. */
  Schema.TaggedStruct("CaptureNow", { version: Version }),
  Schema.TaggedStruct("Ping", { version: Version }),
  Schema.TaggedStruct("Pong", { version: Version }),
]);
export type ExtensionMessage = typeof ExtensionMessage.Type;
