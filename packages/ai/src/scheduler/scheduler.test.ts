import { AssetStoreTest } from "../outputs/asset-test-support.ts";
import { describe, expect, it } from "@effect/vitest";
import { CloudTaskId, UserId, type CloudTaskInput } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import { fakeCrypto, recordingDatabase } from "../cloud-test-support.ts";
import { CloudRuns, schedulerTick } from "./index.ts";
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
    AssetStoreTest,
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
    leaseExpiresAt: status === "scheduled" ? null : new Date(5 * 60 * 60 * 1000),
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
  it.effect("reclaims expired leases and resumes checkpointed runs before queued work", () => {
    const f = fixture();
    f.rows("cloud_task")[0]!.enabled = false;
    queue(f, "dead", "running");
    queue(f, "fresh", "running", UserId.make("other"));
    queue(f, "next");
    f.rows("cloud_run").find((row) => row.id === "dead")!.leaseExpiresAt = new Date(0);
    f.rows("cloud_run").find((row) => row.id === "fresh")!.leaseExpiresAt = new Date(
      5 * 60 * 60 * 1000 + 60_000,
    );
    return Effect.gen(function* () {
      yield* TestClock.setTime(5 * 60 * 60 * 1000);
      yield* schedulerTick();
      const status = (id: string) => f.rows("cloud_run").find((row) => row.id === id)?.status;
      expect(status("dead")).toBe("provisioning");
      expect(status("fresh")).toBe("running");
      expect(f.started).toEqual(["dead"]);
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

it.effect(
  "reclaims terminal cleanup leases without reopening the run or losing its checkpoint",
  () => {
    const f = fixture();
    f.rows("cloud_task")[0]!.enabled = false;
    queue(f, "terminal", "succeeded");
    Object.assign(f.rows("cloud_run")[0]!, {
      leasedBy: "dead-worker",
      leaseExpiresAt: new Date(0),
      usage: { cleanupComplete: false },
      messages: [{ role: "user", content: "checkpoint" }],
      recordingId: "recording",
    });
    return Effect.gen(function* () {
      yield* schedulerTick();
      expect(f.started).toEqual(["terminal"]);
      expect(f.rows("cloud_run")[0]).toMatchObject({
        status: "succeeded",
        recordingId: "recording",
        messages: [{ role: "user", content: "checkpoint" }],
      });
      expect(f.rows("cloud_run")[0]!.leasedBy).not.toBe("dead-worker");
    }).pipe(Effect.provide(f.services));
  },
);
