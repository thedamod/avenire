import * as Schema from "effect/Schema";
import { LibraryFile } from "./library.ts";
import { ClockTime } from "./settings.ts";

export const DEFAULT_DESKTOP_CAPTURE_SHORTCUT = "Alt+C";

export const DesktopWindowChrome = Schema.Struct({
  platform: Schema.String,
  height: Schema.Number,
});
export type DesktopWindowChrome = typeof DesktopWindowChrome.Type;
export const DesktopWindowTheme = Schema.Literals(["dark", "light"]);
export type DesktopWindowTheme = typeof DesktopWindowTheme.Type;

export const DesktopPermission = Schema.Literals(["accessibility", "automation"]);
export type DesktopPermission = typeof DesktopPermission.Type;

export const DesktopOnboardingPreferences = Schema.Struct({
  studyDescription: Schema.String.check(Schema.isMaxLength(200)),
  materialSources: Schema.Array(Schema.Literals(["lms", "pdf", "youtube", "notes", "other"])),
  resultsReadyBy: ClockTime,
  timeZone: Schema.String.check(Schema.isMaxLength(100)),
});
export type DesktopOnboardingPreferences = typeof DesktopOnboardingPreferences.Type;
export const DesktopShortcuts = Schema.Struct({
  capture: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  prompt: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
});
export type DesktopShortcuts = typeof DesktopShortcuts.Type;
export const DesktopSetupChoice = Schema.Struct({
  foregroundCapture: Schema.Boolean,
  preferences: Schema.optionalKey(DesktopOnboardingPreferences),
  shortcuts: Schema.optionalKey(DesktopShortcuts),
  hotkeysEnabled: Schema.optionalKey(Schema.Boolean),
  notificationsEnabled: Schema.optionalKey(Schema.Boolean),
});
export type DesktopSetupChoice = typeof DesktopSetupChoice.Type;

export const DesktopSetupStatus = Schema.Struct({
  completed: Schema.Boolean,
  foregroundCapture: Schema.Boolean,
  platform: Schema.String,
  accessibility: Schema.Literals(["granted", "required", "not-needed"]),
  automation: Schema.Literals(["granted", "required", "not-needed"]),
  foregroundAvailable: Schema.Boolean,
  foregroundNote: Schema.String,
  tabsConnected: Schema.Boolean,
  receiverAvailable: Schema.Boolean,
  captureShortcut: Schema.NullOr(Schema.String),
  promptShortcut: Schema.NullOr(Schema.String),
  requestedShortcuts: Schema.optionalKey(DesktopShortcuts),
  shortcutConflicts: Schema.optionalKey(
    Schema.Struct({ capture: Schema.Boolean, prompt: Schema.Boolean }),
  ),
  preferences: Schema.optionalKey(DesktopOnboardingPreferences),
  hotkeysEnabled: Schema.optionalKey(Schema.Boolean),
  notificationsEnabled: Schema.optionalKey(Schema.Boolean),
});
export type DesktopSetupStatus = typeof DesktopSetupStatus.Type;

export const DesktopCaptureUploads = Schema.Struct({
  files: Schema.Array(LibraryFile),
  skipped: Schema.Array(Schema.Struct({ title: Schema.String, reason: Schema.String })),
});
export type DesktopCaptureUploads = typeof DesktopCaptureUploads.Type;

export const DesktopSetupCapture = Schema.Struct({
  id: Schema.String,
  sources: Schema.Array(Schema.Struct({ title: Schema.String, kind: Schema.String })),
});
export type DesktopSetupCapture = typeof DesktopSetupCapture.Type;

export const DesktopAuthTarget = Schema.Struct({
  port: Schema.Int.check(Schema.isBetween({ minimum: 1024, maximum: 65535 })),
  state: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export type DesktopAuthTarget = typeof DesktopAuthTarget.Type;
