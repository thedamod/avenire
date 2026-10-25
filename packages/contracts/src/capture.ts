/**
 * Capture - what the desktop hotkey observed, before policy, extraction or upload.
 *
 * A snapshot is immutable provenance: it records what was on screen when the
 * hotkey fired. Turning it into inbox files is a separate, idempotent step keyed
 * by each candidate's `dedupeKey`.
 */
import * as Schema from "effect/Schema";

import { CaptureId } from "./ids.ts";

export const TabEngagement = Schema.Struct({
  dwellMs: Schema.Number,
  scrollDepthPct: Schema.Number,
  mediaPlaying: Schema.Boolean,
});
export type TabEngagement = typeof TabEngagement.Type;

export const CapturedTab = Schema.Struct({
  url: Schema.String,
  finalUrl: Schema.optional(Schema.String),
  title: Schema.String,
  activeInWindow: Schema.Boolean,
  incognito: Schema.optional(Schema.Boolean),
  selectionText: Schema.optional(Schema.String),
  likelyPdf: Schema.optional(Schema.Boolean),
  engagement: TabEngagement,
});
export type CapturedTab = typeof CapturedTab.Type;

export const CapturedMedia = Schema.Struct({
  appName: Schema.String,
  title: Schema.String,
  url: Schema.optional(Schema.String),
  filePath: Schema.optional(Schema.String),
  positionSec: Schema.optional(Schema.Number),
  durationSec: Schema.optional(Schema.Number),
});
export type CapturedMedia = typeof CapturedMedia.Type;

export const CapturedWindow = Schema.Struct({
  appName: Schema.String,
  title: Schema.String,
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
  selectionText: Schema.optional(Schema.String),
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
