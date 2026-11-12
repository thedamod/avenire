/** Preferences and account usage are read through the verified transport session. */
import {
  Conflict,
  NotFound,
  type ApiError,
  type SessionUser,
  type SettingsSnapshot,
  type OnboardingPreferences,
  type OnboardingState,
  type UserSettings,
  type UserSettingsPatch,
} from "@avenire/contracts";
import { CloudTasks, validateSchedule } from "@avenire/ai/scheduler";
import { Database } from "@avenire/database/client";
import {
  user,
  userSettings,
  account,
  session,
  file,
  cloudTask,
  cloudRun,
} from "@avenire/database/schema";
import { and, eq, ne, gte, gt, count, sum } from "drizzle-orm";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { toApiError } from "./apiErrors.ts";

export const defaultSettings = (timeZone = "UTC"): UserSettings => ({
  resultsReadyBy: "07:00",
  timeZone,
  fileChanges: "propose",
  sortUnfiledNightly: true,
  captureLoggedInPages: false,
  shareScreenWithAi: false,
  paywalledPages: "title-abstract",
  notifications: { morningReport: true, needsYou: true, runFailed: true },
});
export const digestSchedule = (readyBy: string) => {
  const [hour, minute] = readyBy.split(":").map(Number);
  return { _tag: "cron" as const, expression: `${minute} ${(hour! + 22) % 24} * * *` };
};
export const quotaWeek = (timeZone: string, now: DateTime.Utc) => {
  const start = DateTime.startOf(DateTime.setZoneNamedUnsafe(now, timeZone), "week", {
    weekStartsOn: 1,
  });
  return {
    start: DateTime.toDateUtc(start),
    resetsAt: DateTime.formatIso(DateTime.add(start, { weeks: 1 })),
  };
};
const deviceLabel = (agent: string | null) => {
  if (!agent) return "Unknown device";
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "App";
  const os = /Android/.test(agent)
    ? "Android"
    : /iPhone|iPad/.test(agent)
      ? "iOS"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
};
export class Settings extends Context.Service<
  Settings,
  {
    readonly screenSharing: (viewer: SessionUser) => Effect.Effect<boolean, ApiError>;
    readonly get: (
      viewer: SessionUser,
      requestedTimeZone?: string,
    ) => Effect.Effect<SettingsSnapshot, ApiError>;
    readonly update: (
      viewer: SessionUser,
      patch: UserSettingsPatch,
    ) => Effect.Effect<UserSettings, ApiError>;
    readonly completeOnboarding: (
      viewer: SessionUser,
      preferences: OnboardingPreferences,
    ) => Effect.Effect<OnboardingState, ApiError>;
    readonly updateProfile: (viewer: SessionUser, name: string) => Effect.Effect<void, ApiError>;
    readonly signOutOtherSessions: (viewer: SessionUser) => Effect.Effect<void, ApiError>;
  }
>()("avenire/web/Settings") {}

export const SettingsLive = Layer.effect(
  Settings,
  Effect.gen(function* () {
    const database = yield* Database;
    const tasks = yield* CloudTasks;
    const read = Effect.fn(function* (userId: string, requestedTimeZone = "UTC") {
      const [row] = yield* database.use((db) =>
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      );
      if (row)
        return {
          ...row.preferences,
          shareScreenWithAi: row.preferences.shareScreenWithAi === true,
        };
      const preferences = defaultSettings(
        Option.isSome(DateTime.zoneMakeNamed(requestedTimeZone)) ? requestedTimeZone : "UTC",
      );
      yield* database.use((db) =>
        db
          .insert(userSettings)
          .values({ userId, preferences })
          .onConflictDoNothing({ target: userSettings.userId }),
      );
      const [saved] = yield* database.use((db) =>
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      );
      return {
        ...(saved?.preferences ?? preferences),
        shareScreenWithAi: saved?.preferences.shareScreenWithAi === true,
      };
    });
    const savePreferences = (viewer: SessionUser, patch: UserSettingsPatch, complete = false) =>
      Effect.gen(function* () {
        if (patch.timeZone !== undefined && Option.isNone(DateTime.zoneMakeNamed(patch.timeZone)))
          return yield* new Conflict({ reason: "Unknown IANA time zone." });
        yield* tasks.ensureDefaultTask(viewer.id, patch.timeZone);
        const now = yield* DateTime.now;
        const result = yield* database.useTransaction(async (tx) => {
          const [profile] = await tx
            .select({ id: user.id, onboardingCompletedAt: user.onboardingCompletedAt })
            .from(user)
            .where(eq(user.id, viewer.id))
            .for("no key update");
          if (!profile) return undefined;
          const [row] = await tx
            .select()
            .from(userSettings)
            .where(eq(userSettings.userId, viewer.id));
          const old = row?.preferences ?? defaultSettings();
          const preferences: UserSettings = {
            ...old,
            shareScreenWithAi: old.shareScreenWithAi === true,
            ...patch,
            notifications: { ...old.notifications, ...patch.notifications },
          };
          const schedule = digestSchedule(preferences.resultsReadyBy);
          const next = await Effect.runPromise(
            validateSchedule(schedule, preferences.timeZone, now),
          );
          if (!row || patch.resultsReadyBy !== undefined || patch.timeZone !== undefined)
            await tx
              .update(cloudTask)
              .set({
                schedule,
                timeZone: preferences.timeZone,
                nextRunAt: Option.isSome(next) ? DateTime.toDateUtc(next.value) : null,
                updatedAt: DateTime.toDateUtc(now),
              })
              .where(and(eq(cloudTask.userId, viewer.id), eq(cloudTask.builtin, "nightly-digest")));
          await tx
            .insert(userSettings)
            .values({ userId: viewer.id, preferences })
            .onConflictDoUpdate({
              target: userSettings.userId,
              set: { preferences, updatedAt: DateTime.toDateUtc(now) },
            });
          const completedAt =
            profile.onboardingCompletedAt ?? (complete ? DateTime.toDateUtc(now) : null);
          if (complete && profile.onboardingCompletedAt === null)
            await tx
              .update(user)
              .set({ onboardingCompletedAt: completedAt })
              .where(eq(user.id, viewer.id));
          return {
            settings: preferences,
            onboardingCompletedAt: completedAt?.toISOString() ?? null,
          };
        });
        if (!result) return yield* new NotFound({ entity: "User", id: viewer.id });
        return result;
      }).pipe(Effect.mapError(toApiError));

    return Settings.of({
      screenSharing: (viewer) => readScreenSharingPreference(database, viewer),
      get: (viewer, requestedTimeZone) =>
        Effect.gen(function* () {
          const preferences = yield* read(viewer.id, requestedTimeZone);
          const now = yield* DateTime.now;
          const week = quotaWeek(preferences.timeZone, now);
          const [profile] = yield* database.use((db) =>
            db
              .select({
                name: user.name,
                email: user.email,
                image: user.image,
                onboardingCompletedAt: user.onboardingCompletedAt,
              })
              .from(user)
              .where(eq(user.id, viewer.id)),
          );
          if (!profile) return yield* new NotFound({ entity: "User", id: viewer.id });
          const providers = yield* database.use((db) =>
            db
              .select({ providerId: account.providerId })
              .from(account)
              .where(eq(account.userId, viewer.id)),
          );
          const sessions = yield* database.use((db) =>
            db
              .select({
                id: session.id,
                userAgent: session.userAgent,
                updatedAt: session.updatedAt,
              })
              .from(session)
              .where(
                and(eq(session.userId, viewer.id), gt(session.expiresAt, DateTime.toDateUtc(now))),
              ),
          );
          const [runs] = yield* database.use((db) =>
            db
              .select({ count: count() })
              .from(cloudRun)
              .where(and(eq(cloudRun.userId, viewer.id), gte(cloudRun.startedAt, week.start))),
          );
          const [bytes] = yield* database.use((db) =>
            db
              .select({ bytes: sum(file.sizeBytes) })
              .from(file)
              .where(and(eq(file.userId, viewer.id), ne(file.placement, "archived"))),
          );
          return {
            onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
            settings: preferences,
            account: {
              name: profile.name,
              email: profile.email,
              image: profile.image,
              providers: [...new Set(providers.map((p) => p.providerId))],
              sessions: sessions.map((s) => ({
                id: s.id,
                current: s.id === viewer.sessionId,
                device: deviceLabel(s.userAgent),
                lastActiveAt: s.updatedAt.toISOString(),
              })),
            },
            usage: {
              plan: "free" as const,
              overnightRunsThisWeek: runs?.count ?? 0,
              overnightRunLimit: 5,
              resetsAt: week.resetsAt,
              storageBytes: Number(bytes?.bytes ?? 0),
              storageLimitBytes: 2 * 1024 ** 3,
            },
          };
        }).pipe(Effect.mapError(toApiError)),
      update: (viewer, patch) =>
        savePreferences(viewer, patch).pipe(Effect.map((state) => state.settings)),
      completeOnboarding: (viewer, preferences) => savePreferences(viewer, preferences, true),
      updateProfile: (viewer, name) =>
        Effect.gen(function* () {
          if (!name.trim() || name.trim().length > 100)
            return yield* new Conflict({ reason: "Invalid name." });
          yield* database.use((db) =>
            db
              .update(user)
              .set({ name: name.trim(), updatedAt: new Date() })
              .where(eq(user.id, viewer.id)),
          );
        }).pipe(Effect.mapError(toApiError)),
      signOutOtherSessions: (viewer) =>
        Effect.gen(function* () {
          if (!viewer.sessionId)
            return yield* new Conflict({ reason: "Current session could not be resolved." });
          yield* database.use((db) =>
            db
              .delete(session)
              .where(and(eq(session.userId, viewer.id), ne(session.id, viewer.sessionId!))),
          );
        }).pipe(Effect.mapError(toApiError)),
    });
  }),
);

/** Permission reads require only authenticated database access, never AI/cloud credentials. */
const readScreenSharingPreference = (
  database: Database["Service"],
  viewer: Pick<SessionUser, "id">,
) =>
  Effect.gen(function* () {
    const [row] = yield* database.use((db) =>
      db.select().from(userSettings).where(eq(userSettings.userId, viewer.id)),
    );
    return row?.preferences.shareScreenWithAi === true;
  }).pipe(Effect.mapError(toApiError));

export class ScreenSharing extends Context.Service<
  ScreenSharing,
  {
    readonly enabled: (viewer: Pick<SessionUser, "id">) => Effect.Effect<boolean, ApiError>;
  }
>()("avenire/web/ScreenSharing") {}
export const ScreenSharingLive = Layer.effect(
  ScreenSharing,
  Effect.gen(function* () {
    const database = yield* Database;
    return ScreenSharing.of({ enabled: (viewer) => readScreenSharingPreference(database, viewer) });
  }),
);
