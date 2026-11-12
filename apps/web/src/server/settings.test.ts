import { UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { CloudTasks } from "@avenire/ai/scheduler";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { recordingDatabase } from "../../../../packages/ai/src/cloud-test-support.ts";
import { Settings, SettingsLive, defaultSettings, quotaWeek } from "./settings.ts";

it.effect(
  "settings update reschedules the builtin digest two hours before results in the user's zone",
  () => {
    const f = recordingDatabase();
    const viewer = { id: UserId.make("owner"), name: "Owner", email: "owner@test" };
    f.rows("user").push({ id: viewer.id });
    f.rows("user_settings").push({ userId: viewer.id, preferences: defaultSettings() });
    f.rows("cloud_task").push(
      { id: "digest", userId: viewer.id, builtin: "nightly-digest", enabled: true },
      {
        id: "custom",
        userId: viewer.id,
        builtin: null,
        schedule: { _tag: "cron", expression: "0 1 * * *" },
      },
    );
    const tasks = { ensureDefaultTask: () => Effect.void } as unknown as CloudTasks["Service"];
    return Effect.gen(function* () {
      const service = yield* Settings;
      const preferences = yield* service.update(viewer, {
        resultsReadyBy: "01:30",
        timeZone: "America/New_York",
        notifications: { morningReport: false },
      });
      expect(preferences.notifications).toEqual({
        morningReport: false,
        needsYou: true,
        runFailed: true,
      });
      expect(f.rows("cloud_task")[0]).toMatchObject({
        schedule: { _tag: "cron", expression: "30 23 * * *" },
        timeZone: "America/New_York",
        nextRunAt: expect.any(Date),
      });
      expect(f.rows("cloud_task")[1]!.schedule).toEqual({ _tag: "cron", expression: "0 1 * * *" });
      expect(
        yield* service.update(viewer, { timeZone: "not/a/zone" }).pipe(Effect.result),
      ).toMatchObject({ failure: { _tag: "Conflict" } });
      const week = quotaWeek("America/New_York", DateTime.makeUnsafe("2026-03-08T12:00:00Z"));
      expect(week.start.toISOString()).toBe("2026-03-02T05:00:00.000Z");
      expect(week.resetsAt).toBe("2026-03-09T04:00:00.000Z");
    }).pipe(
      Effect.provide(
        SettingsLive.pipe(
          Layer.provide(
            Layer.mergeAll(Layer.succeed(Database, f.database), Layer.succeed(CloudTasks, tasks)),
          ),
        ),
      ),
    );
  },
);

it.effect("onboarding merges preferences and preserves the first completion timestamp", () => {
  const f = recordingDatabase();
  const viewer = { id: UserId.make("new-user"), name: "New", email: "new@test" };
  f.rows("user").push({ id: viewer.id, onboardingCompletedAt: null });
  f.rows("user_settings").push({ userId: viewer.id, preferences: defaultSettings() });
  f.rows("cloud_task").push({ id: "digest", userId: viewer.id, builtin: "nightly-digest" });
  const tasks = { ensureDefaultTask: () => Effect.void } as unknown as CloudTasks["Service"];
  return Effect.gen(function* () {
    const service = yield* Settings;
    const first = yield* service.completeOnboarding(viewer, {
      studyDescription: "Physics",
      materialSources: ["pdf", "notes"],
      resultsReadyBy: "08:30",
      notifications: { morningReport: false },
    });
    expect(first.onboardingCompletedAt).toEqual(expect.any(String));
    expect(first.settings).toMatchObject({
      studyDescription: "Physics",
      materialSources: ["pdf", "notes"],
      resultsReadyBy: "08:30",
      notifications: { morningReport: false, needsYou: true, runFailed: true },
    });
    expect(f.rows("cloud_task")[0]).toMatchObject({
      schedule: { _tag: "cron", expression: "30 6 * * *" },
    });
    const writes = f.writes.filter((w) => w.table === "user").length;
    const second = yield* service.completeOnboarding(viewer, {});
    expect(second).toEqual(first);
    expect(f.writes.filter((w) => w.table === "user")).toHaveLength(writes);
    expect(f.rows("user")[0]!.onboardingCompletedAt).toEqual(
      new Date(first.onboardingCompletedAt!),
    );
  }).pipe(
    Effect.provide(
      SettingsLive.pipe(
        Layer.provide(
          Layer.mergeAll(Layer.succeed(Database, f.database), Layer.succeed(CloudTasks, tasks)),
        ),
      ),
    ),
  );
});

it.effect(
  "old saved JSON is default-off and explicit screen-sharing enable/disable persists",
  () => {
    const f = recordingDatabase();
    const viewer = { id: UserId.make("screen-owner"), name: "Owner", email: "owner@test" };
    const { shareScreenWithAi: _removed, ...old } = defaultSettings();
    f.rows("user").push({ id: viewer.id });
    f.rows("user_settings").push({ userId: viewer.id, preferences: old });
    return Effect.gen(function* () {
      const service = yield* Settings;
      expect(yield* service.screenSharing(viewer)).toBe(false);
      expect((yield* service.update(viewer, {})).shareScreenWithAi).toBe(false);
      expect((yield* service.update(viewer, { shareScreenWithAi: true })).shareScreenWithAi).toBe(
        true,
      );
      expect(yield* service.screenSharing(viewer)).toBe(true);
      expect((yield* service.update(viewer, { shareScreenWithAi: false })).shareScreenWithAi).toBe(
        false,
      );
      expect(yield* service.screenSharing(viewer)).toBe(false);
      expect(f.rows("user_settings")[0]!.preferences).toMatchObject({ shareScreenWithAi: false });
    }).pipe(
      Effect.provide(
        SettingsLive.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(Database, f.database),
              Layer.succeed(CloudTasks, {
                ensureDefaultTask: () => Effect.void,
              } as unknown as CloudTasks["Service"]),
            ),
          ),
        ),
      ),
    );
  },
);
