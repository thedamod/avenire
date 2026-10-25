/**
 * Settings - the signed-in user's preferences, account and usage, as shown on the
 * Settings page (desktop and mobile).
 */
import * as Schema from "effect/Schema";

/** `HH:mm` in the user's time zone. */
export const ClockTime = Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/));

export const UserSettings = Schema.Struct({
  studyDescription: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
  materialSources: Schema.optionalKey(
    Schema.Array(Schema.Literals(["lms", "pdf", "youtube", "notes", "other"])),
  ),
  /** Overnight results are ready by this time; drives the nightly-digest task's schedule. */
  resultsReadyBy: ClockTime,
  timeZone: Schema.String,
  /** Default for new Cloud tasks: propose changes for morning approval, or apply them. */
  fileChanges: Schema.Literals(["propose", "apply"]),
  /** Ruth proposes notebooks for Unfiled sources every night (no run quota). */
  sortUnfiledNightly: Schema.Boolean,
  /** Desktop capture may read pages the user is logged into, with their own session. */
  captureLoggedInPages: Schema.Boolean,
  /** What capture keeps when a page is behind a paywall. */
  paywalledPages: Schema.Literals(["title-abstract", "skip"]),
  notifications: Schema.Struct({
    morningReport: Schema.Boolean,
    needsYou: Schema.Boolean,
    runFailed: Schema.Boolean,
  }),
});
export type UserSettings = typeof UserSettings.Type;

export const UserSettingsPatch = Schema.Struct({
  studyDescription: UserSettings.fields.studyDescription,
  materialSources: UserSettings.fields.materialSources,
  resultsReadyBy: Schema.optionalKey(ClockTime),
  timeZone: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(100))),
  fileChanges: Schema.optionalKey(UserSettings.fields.fileChanges),
  sortUnfiledNightly: Schema.optionalKey(Schema.Boolean),
  captureLoggedInPages: Schema.optionalKey(Schema.Boolean),
  paywalledPages: Schema.optionalKey(UserSettings.fields.paywalledPages),
  notifications: Schema.optionalKey(
    Schema.Struct({
      morningReport: Schema.optionalKey(Schema.Boolean),
      needsYou: Schema.optionalKey(Schema.Boolean),
      runFailed: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});
export type UserSettingsPatch = typeof UserSettingsPatch.Type;

/** First-login preferences share validation with ordinary settings updates. */
export const OnboardingPreferences = Schema.Struct({
  studyDescription: UserSettingsPatch.fields.studyDescription,
  materialSources: UserSettingsPatch.fields.materialSources,
  resultsReadyBy: UserSettingsPatch.fields.resultsReadyBy,
  timeZone: UserSettingsPatch.fields.timeZone,
  notifications: Schema.optionalKey(
    Schema.Struct({ morningReport: Schema.optionalKey(Schema.Boolean) }),
  ),
});
export type OnboardingPreferences = typeof OnboardingPreferences.Type;

export const OnboardingState = Schema.Struct({
  onboardingCompletedAt: Schema.NullOr(Schema.String),
  settings: UserSettings,
});
export type OnboardingState = typeof OnboardingState.Type;

export const AccountSession = Schema.Struct({
  id: Schema.String,
  current: Schema.Boolean,
  /** Short device label derived from the user agent, e.g. "Chrome on Windows". */
  device: Schema.String,
  lastActiveAt: Schema.String,
});
export type AccountSession = typeof AccountSession.Type;

export const Account = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  /** Linked sign-in providers, e.g. "google", "credential". */
  providers: Schema.Array(Schema.String),
  sessions: Schema.Array(AccountSession),
});
export type Account = typeof Account.Type;

export const Usage = Schema.Struct({
  plan: Schema.Literals(["free", "pro"]),
  overnightRunsThisWeek: Schema.Int,
  overnightRunLimit: Schema.Int,
  /** Start of the next quota week (ISO). */
  resetsAt: Schema.String,
  storageBytes: Schema.Number,
  storageLimitBytes: Schema.Number,
});
export type Usage = typeof Usage.Type;

export const SettingsSnapshot = Schema.Struct({
  onboardingCompletedAt: Schema.NullOr(Schema.String),
  settings: UserSettings,
  account: Account,
  usage: Usage,
});
export type SettingsSnapshot = typeof SettingsSnapshot.Type;
