import {
  ArtifactId,
  CloudRunId,
  CloudTaskId,
  Conflict,
  FileId,
  NotFound,
  StorageKey,
  type CloudRun as ContractRun,
  type CloudTask as ContractTask,
  type CloudTaskInput,
  type UserId,
} from "@avenire/contracts";
import { Database, type DatabaseError } from "@avenire/database/client";
import {
  artifact,
  cloudRun,
  cloudTask,
  user,
  type ArtifactRow,
  type CloudRunRow,
  type CloudTaskRow,
} from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as PlatformError from "effect/PlatformError";
import { NIGHTLY_DIGEST_PROMPT } from "../prompts/cloud.ts";
import { validateSchedule } from "./occurrence.ts";

export type CloudTaskPatch = Partial<CloudTaskInput>;
export type CloudTasksError = DatabaseError | Conflict | NotFound | PlatformError.PlatformError;
export class CloudTasks extends Context.Service<
  CloudTasks,
  {
    readonly list: (userId: UserId) => Effect.Effect<readonly ContractTask[], CloudTasksError>;
    readonly create: (
      userId: UserId,
      input: CloudTaskInput,
    ) => Effect.Effect<ContractTask, CloudTasksError>;
    readonly update: (
      userId: UserId,
      taskId: CloudTaskId,
      patch: CloudTaskPatch,
    ) => Effect.Effect<ContractTask, CloudTasksError>;
    readonly delete: (userId: UserId, taskId: CloudTaskId) => Effect.Effect<void, CloudTasksError>;
    readonly runNow: (
      userId: UserId,
      taskId: CloudTaskId,
    ) => Effect.Effect<ContractRun, CloudTasksError>;
    readonly cancelRun: (
      userId: UserId,
      runId: CloudRunId,
    ) => Effect.Effect<ContractRun, CloudTasksError>;
    readonly listRuns: (
      userId: UserId,
      limit?: number,
    ) => Effect.Effect<readonly ContractRun[], DatabaseError>;
    readonly ensureDefaultTask: (
      userId: UserId,
      timeZone?: string,
    ) => Effect.Effect<void, CloudTasksError>;
  }
>()("avenire/ai/CloudTasks") {}

const iso = (date: Date | null) => date?.toISOString() ?? null;
export const taskToContract = (row: CloudTaskRow): ContractTask => ({
  id: CloudTaskId.make(row.id),
  title: row.title,
  prompt: row.prompt,
  schedule: row.schedule,
  timeZone: row.timeZone,
  preHydration: row.preHydration,
  delivery: row.delivery,
  enabled: row.enabled,
  builtin: row.builtin,
  nextRunAt: iso(row.nextRunAt),
  lastRunAt: iso(row.lastRunAt),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
export const runToContract = (
  row: CloudRunRow,
  taskTitle: string,
  artifacts: readonly ArtifactRow[],
): ContractRun => ({
  id: CloudRunId.make(row.id),
  taskId: CloudTaskId.make(row.taskId),
  taskTitle,
  status: row.status,
  scheduledFor: row.scheduledFor.toISOString(),
  attempt: row.attempt,
  summary: row.summary,
  startedAt: iso(row.startedAt),
  finishedAt: iso(row.finishedAt),
  error: row.error,
  artifacts: artifacts.map((entry) => ({
    id: ArtifactId.make(entry.id),
    kind: entry.kind,
    title: entry.title,
    storageKey: StorageKey.make(entry.storageKey),
    mimeType: entry.mimeType,
    sourceFileIds: entry.sourceFileIds.map((id) => FileId.make(id)),
    createdAt: entry.createdAt.toISOString(),
  })),
});
const nextDate = (next: Option.Option<DateTime.Utc>) =>
  Option.match(next, {
    onNone: () => null,
    onSome: DateTime.toDateUtc,
  });

export const CloudTasksLive = Layer.effect(
  CloudTasks,
  Effect.gen(function* () {
    const database = yield* Database;
    const crypto = yield* Crypto.Crypto;
    const ownedTask = (userId: UserId, taskId: CloudTaskId) =>
      database
        .use((db) =>
          db.query.cloudTask.findFirst({
            where: and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)),
          }),
        )
        .pipe(
          Effect.flatMap((row) =>
            row
              ? Effect.succeed(row)
              : Effect.fail(new NotFound({ entity: "CloudTask", id: taskId })),
          ),
        );
    const getRun = Effect.fn("CloudTasks.getRun")(function* (userId: UserId, runId: CloudRunId) {
      const row = yield* database.use((db) =>
        db.query.cloudRun.findFirst({
          where: and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId)),
        }),
      );
      if (!row) return yield* new NotFound({ entity: "CloudRun", id: runId });
      const task = yield* ownedTask(userId, CloudTaskId.make(row.taskId));
      const artifacts = yield* database.use((db) =>
        db.query.artifact.findMany({
          where: and(eq(artifact.cloudRunId, runId), eq(artifact.userId, userId)),
          orderBy: [asc(artifact.createdAt)],
        }),
      );
      return runToContract(row, task.title, artifacts);
    });
    const ensureDefaultTask = Effect.fn("CloudTasks.ensureDefaultTask")(function* (
      userId: UserId,
      timeZone = "UTC",
    ) {
      const now = yield* DateTime.now;
      const schedule = { _tag: "cron", expression: "0 3 * * *" } as const;
      const next = yield* validateSchedule(schedule, timeZone, now);
      const id = yield* newId(CloudTaskId).pipe(Effect.provideService(Crypto.Crypto, crypto));
      yield* database.use((db) =>
        db
          .insert(cloudTask)
          .values({
            id,
            userId,
            title: "Nightly study digest",
            prompt: NIGHTLY_DIGEST_PROMPT,
            schedule,
            timeZone,
            preHydration: [{ selector: { time: { today: true } } }],
            delivery: { email: true },
            enabled: true,
            builtin: "nightly-digest",
            nextRunAt: nextDate(next),
          })
          .onConflictDoNothing({
            target: [cloudTask.userId, cloudTask.builtin],
            where: isNotNull(cloudTask.builtin),
          }),
      );
    });
    const service = CloudTasks.of({
      ensureDefaultTask,
      list: Effect.fn("CloudTasks.list")(function* (userId) {
        yield* ensureDefaultTask(userId);
        return (yield* database.use((db) =>
          db.query.cloudTask.findMany({
            where: eq(cloudTask.userId, userId),
            orderBy: [asc(cloudTask.createdAt), asc(cloudTask.id)],
          }),
        )).map(taskToContract);
      }),
      create: Effect.fn("CloudTasks.create")(function* (userId, input) {
        const now = yield* DateTime.now;
        const next = yield* validateSchedule(input.schedule, input.timeZone, now);
        const id = yield* newId(CloudTaskId).pipe(Effect.provideService(Crypto.Crypto, crypto));
        const [row] = yield* database.use((db) =>
          db
            .insert(cloudTask)
            .values({
              ...input,
              id,
              userId,
              nextRunAt: input.enabled ? nextDate(next) : null,
            })
            .returning(),
        );
        if (!row) return yield* new NotFound({ entity: "CloudTask", id });
        return taskToContract(row);
      }),
      update: Effect.fn("CloudTasks.update")(function* (userId, taskId, patch) {
        const now = yield* DateTime.now;
        // Serialize patches with the scheduler so an edit cannot restore an already consumed occurrence.
        const result = yield* database.useTransaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(cloudTask)
            .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)))
            .for("update");
          if (!row) return { kind: "missing" as const };
          const input = { ...row, ...patch };
          const validated = await Effect.runPromise(
            Effect.result(validateSchedule(input.schedule, input.timeZone, now)),
          );
          if (validated._tag === "Failure")
            return { kind: "invalid" as const, error: validated.failure };
          const [saved] = await tx
            .update(cloudTask)
            .set({
              ...patch,
              nextRunAt: input.enabled ? nextDate(validated.success) : null,
              updatedAt: DateTime.toDateUtc(now),
            })
            .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)))
            .returning();
          return { kind: "saved" as const, row: saved };
        });
        if (result.kind === "invalid") return yield* result.error;
        if (result.kind === "missing" || !result.row)
          return yield* new NotFound({ entity: "CloudTask", id: taskId });
        return taskToContract(result.row);
      }),
      delete: Effect.fn("CloudTasks.delete")(function* (userId, taskId) {
        const task = yield* ownedTask(userId, taskId);
        if (task.builtin) {
          yield* database.use((db) =>
            db
              .update(cloudTask)
              .set({ enabled: false, nextRunAt: null, updatedAt: sql`now()` })
              .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId))),
          );
          return;
        }
        const outcome = yield* database.useTransaction(async (tx) => {
          await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId))
            .for("no key update");
          await tx
            .select({ id: cloudTask.id })
            .from(cloudTask)
            .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)))
            .for("update");
          const active = await tx
            .select({ id: cloudRun.id })
            .from(cloudRun)
            .where(
              and(
                eq(cloudRun.taskId, taskId),
                eq(cloudRun.userId, userId),
                inArray(cloudRun.status, ["scheduled", "provisioning", "running"]),
              ),
            );
          if (active.length) return false;
          await tx
            .delete(cloudTask)
            .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)));
          return true;
        });
        if (!outcome)
          return yield* new Conflict({
            reason: "Cancel this task's active runs before deleting it.",
          });
      }),
      runNow: Effect.fn("CloudTasks.runNow")(function* (userId, taskId) {
        const id = yield* newId(CloudRunId).pipe(Effect.provideService(Crypto.Crypto, crypto));
        const now = DateTime.toDateUtc(yield* DateTime.now);
        const outcome = yield* database.useTransaction(async (tx) => {
          await tx
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId))
            .for("no key update");
          const [task] = await tx
            .select()
            .from(cloudTask)
            .where(and(eq(cloudTask.id, taskId), eq(cloudTask.userId, userId)))
            .for("update");
          if (!task) return "missing";
          const active = await tx
            .select({ id: cloudRun.id })
            .from(cloudRun)
            .where(
              and(
                eq(cloudRun.userId, userId),
                eq(cloudRun.taskId, taskId),
                inArray(cloudRun.status, ["scheduled", "provisioning", "running"]),
              ),
            );
          if (active.length) return "conflict";
          await tx.insert(cloudRun).values({
            id,
            userId,
            taskId,
            status: "scheduled",
            scheduledFor: now,
            attempt: 1,
            notBefore: now,
          });
          return "created";
        });
        if (outcome === "missing") return yield* new NotFound({ entity: "CloudTask", id: taskId });
        if (outcome === "conflict")
          return yield* new Conflict({
            reason: "A run of this task is already scheduled or active.",
          });
        // The worker is the sole executor; requests only enqueue work.
        return yield* getRun(userId, id);
      }),
      cancelRun: Effect.fn("CloudTasks.cancelRun")(function* (userId, runId) {
        const run = yield* getRun(userId, runId);
        if (["succeeded", "failed", "cancelled"].includes(run.status)) return run;
        yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ status: "cancelled", finishedAt: sql`now()` })
            .where(
              and(
                eq(cloudRun.id, runId),
                eq(cloudRun.userId, userId),
                inArray(cloudRun.status, ["scheduled", "provisioning", "running"]),
              ),
            ),
        );
        return yield* getRun(userId, runId);
      }),
      listRuns: Effect.fn("CloudTasks.listRuns")(function* (userId, limit = 20) {
        const rows = yield* database.use((db) =>
          db
            .select({ run: cloudRun, taskTitle: cloudTask.title })
            .from(cloudRun)
            .innerJoin(
              cloudTask,
              and(eq(cloudRun.taskId, cloudTask.id), eq(cloudTask.userId, userId)),
            )
            .where(eq(cloudRun.userId, userId))
            .orderBy(desc(cloudRun.createdAt), desc(cloudRun.id))
            .limit(Math.max(1, Math.min(100, Math.floor(limit)))),
        );
        return yield* Effect.forEach(rows, ({ run, taskTitle }) =>
          database
            .use((db) =>
              db.query.artifact.findMany({
                where: and(eq(artifact.cloudRunId, run.id), eq(artifact.userId, userId)),
                orderBy: [asc(artifact.createdAt)],
              }),
            )
            .pipe(Effect.map((artifacts) => runToContract(run, taskTitle, artifacts))),
        );
      }),
    });
    return service;
  }),
);
