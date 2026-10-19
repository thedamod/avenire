import { describe, expect, it } from "@effect/vitest";
import { CloudRunId, CloudTaskId, UserId, type CloudTaskInput } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { fakeCrypto, recordingDatabase } from "../cloud-test-support.ts";
import { claimRun, CloudRuns, schedulerTick } from "./index.ts";
import { CloudTasks, CloudTasksLive } from "./tasks.ts";

const userId = UserId.make("owner");
const taskId = CloudTaskId.make("task");
const input: CloudTaskInput = {
  title: "Study",
  prompt: "Create study notes",
  schedule: { _tag: "cron", expression: "0 3 * * *" },
  timeZone: "UTC",
  preHydration: [],
  delivery: { email: true },
  enabled: true,
};
const fixture = () => {
  const f = recordingDatabase();
  f.rows("user").push({ id: userId, name: "Owner", email: "owner@example.test" });
  f.rows("cloud_task").push({
    ...input,
    id: taskId,
    userId,
    nextRunAt: new Date(0),
    lastRunAt: null,
    builtin: null,
    maxAttempts: 2,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  const started: string[] = [];
  const services = Layer.mergeAll(
    Layer.succeed(Database, f.database),
    Layer.succeed(Crypto.Crypto, fakeCrypto),
    Layer.succeed(
      CloudRuns,
      CloudRuns.of({
        start: (id) =>
          Effect.sync(() => {
            started.push(id);
          }),
      }),
    ),
  );
  return { ...f, started, services };
};
const queue = (
  f: ReturnType<typeof fixture>,
  id: string,
  status = "scheduled",
  owner = userId,
  notBefore = 0,
) =>
  f.rows("cloud_run").push({
    id,
    userId: owner,
    taskId,
    status,
    notBefore: new Date(notBefore),
    attempt: 1,
    scheduledFor: new Date(0),
    createdAt: new Date(0),
    startedAt: null,
    finishedAt: null,
    summary: null,
    error: null,
  });

describe("scheduler tick", () => {
  it.effect("inserts exactly one occurrence, advances nextRunAt and is idempotent", () => {
    const f = fixture();
    return Effect.gen(function* () {
      yield* schedulerTick();
      yield* schedulerTick();
      expect(f.rows("cloud_run")).toHaveLength(1);
      expect(f.rows("cloud_run")[0]).toMatchObject({
        taskId,
        scheduledFor: new Date(0),
        attempt: 1,
        notBefore: new Date(0),
        status: "provisioning",
      });
      expect(f.rows("cloud_task")[0]?.nextRunAt).toEqual(new Date("1970-01-01T03:00:00Z"));
      expect(f.started).toHaveLength(1);
      expect(
        f.statements.some(
          (statement) =>
            statement.sql.includes('"cloud_run"."status" =') &&
            statement.params.includes("scheduled"),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(f.services));
  });
  it.effect("claims one active run per user and respects retry notBefore", () => {
    const f = fixture();
    f.rows("cloud_task")[0]!.enabled = false;
    queue(f, "one", "running");
    queue(f, "two");
    queue(f, "three");
    queue(f, "future", "scheduled", userId, 300_000);
    queue(f, "other", "scheduled", UserId.make("other"));
    return Effect.gen(function* () {
      yield* schedulerTick();
      // "one" is still running, so this user's queued runs wait; other users are unaffected.
      expect(f.started).toEqual(["other"]);
      expect(
        f
          .rows("cloud_run")
          .filter(
            (row) =>
              row.userId === userId && ["running", "provisioning"].includes(String(row.status)),
          ),
      ).toHaveLength(1);
      expect(f.rows("cloud_run").find((row) => row.id === "future")?.status).toBe("scheduled");
    }).pipe(Effect.provide(f.services));
  });
  it.effect("fails runs whose worker died, freeing the user's slot", () => {
    const f = fixture();
    f.rows("cloud_task")[0]!.enabled = false;
    queue(f, "dead", "running");
    queue(f, "fresh", "running", UserId.make("other"));
    queue(f, "next");
    f.rows("cloud_run").find((row) => row.id === "dead")!.claimedAt = new Date(0);
    f.rows("cloud_run").find((row) => row.id === "fresh")!.claimedAt = new Date(
      5 * 60 * 60 * 1000 - 60_000,
    );
    return Effect.gen(function* () {
      yield* TestClock.setTime(5 * 60 * 60 * 1000);
      yield* schedulerTick();
      const status = (id: string) => f.rows("cloud_run").find((row) => row.id === id)?.status;
      expect(status("dead")).toBe("failed");
      expect(status("fresh")).toBe("running");
      expect(f.started).toEqual(["next"]);
    }).pipe(Effect.provide(f.services));
  });
  it.effect("second atomic claim returns nothing, including concurrent attempts", () => {
    const f = fixture();
    queue(f, "run");
    return Effect.gen(function* () {
      const now = yield* DateTime.now;
      const claims = yield* Effect.all(
        [
          claimRun(CloudRunId.make("run"), userId, now),
          claimRun(CloudRunId.make("run"), userId, now),
        ],
        { concurrency: "unbounded" },
      );
      expect(claims.filter(Option.isSome)).toHaveLength(1);
      expect(yield* claimRun(CloudRunId.make("run"), userId, now)).toEqual(Option.none());
    }).pipe(Effect.provide(f.services));
  });
  it.effect("concurrent ticks consume a once task just once", () => {
    const f = fixture();
    f.rows("cloud_task")[0]!.schedule = { _tag: "once", at: "1970-01-01T00:00:00Z" };
    return Effect.gen(function* () {
      yield* Effect.all([schedulerTick(), schedulerTick()], { concurrency: "unbounded" });
      expect(f.rows("cloud_run")).toHaveLength(1);
      expect(f.rows("cloud_task")[0]?.nextRunAt).toBeNull();
    }).pipe(Effect.provide(f.services));
  });
});

describe("CloudTasks", () => {
  it.effect("creates the built-in once and preserves disabling it", () => {
    const f = fixture();
    return Effect.gen(function* () {
      const service = yield* CloudTasks;
      yield* service.ensureDefaultTask(userId, "Asia/Kolkata");
      yield* service.ensureDefaultTask(userId);
      let builtin = (yield* service.list(userId)).find((task) => task.builtin)!;
      expect(builtin).toMatchObject({
        title: "Nightly study digest",
        timeZone: "Asia/Kolkata",
        enabled: true,
        schedule: { _tag: "cron", expression: "0 3 * * *" },
        preHydration: [{ selector: { time: { today: true } } }],
        delivery: { email: true },
      });
      yield* service.delete(userId, builtin.id);
      builtin = (yield* service.list(userId)).find((task) => task.builtin)!;
      expect(builtin.enabled).toBe(false);
      expect(f.rows("cloud_task").filter((row) => row.builtin)).toHaveLength(1);
    }).pipe(Effect.provide(CloudTasksLive.pipe(Layer.provide(f.services))));
  });
  it.effect("create/update validate schedules and recompute nextRunAt", () => {
    const f = fixture();
    return Effect.gen(function* () {
      const service = yield* CloudTasks;
      const invalid = yield* Effect.flip(
        service.create(userId, { ...input, schedule: { _tag: "cron", expression: "nope" } }),
      );
      expect(invalid._tag).toBe("Conflict");
      const created = yield* service.create(userId, input);
      const saved = yield* service.update(userId, created.id, { timeZone: "Asia/Kolkata" });
      expect(saved.nextRunAt).toBe("1970-01-01T21:30:00.000Z");
      expect(
        (yield* Effect.flip(service.update(userId, created.id, { timeZone: "Invalid/Zone" })))._tag,
      ).toBe("Conflict");
      expect((yield* service.update(userId, created.id, { enabled: false })).nextRunAt).toBeNull();
      expect(
        (yield* Effect.flip(service.update(UserId.make("other"), created.id, { title: "No" })))
          ._tag,
      ).toBe("NotFound");
    }).pipe(Effect.provide(CloudTasksLive.pipe(Layer.provide(f.services))));
  });
  it.effect("runNow conflicts with any queued/active run and cancellation is owned", () => {
    const f = fixture();
    return Effect.gen(function* () {
      const service = yield* CloudTasks;
      const first = yield* service.runNow(userId, taskId);
      expect(first).toMatchObject({
        taskId,
        taskTitle: "Study",
        scheduledFor: "1970-01-01T00:00:00.000Z",
        attempt: 1,
        summary: null,
      });
      expect((yield* Effect.flip(service.runNow(userId, taskId)))._tag).toBe("Conflict");
      expect((yield* Effect.flip(service.cancelRun(UserId.make("other"), first.id)))._tag).toBe(
        "NotFound",
      );
      expect((yield* service.cancelRun(userId, first.id)).status).toBe("cancelled");
      expect(yield* service.listRuns(userId)).toHaveLength(1);
      yield* service.delete(userId, taskId);
      expect(f.rows("cloud_task").some((row) => row.id === taskId)).toBe(false);
    }).pipe(Effect.provide(CloudTasksLive.pipe(Layer.provide(f.services))));
  });
});
