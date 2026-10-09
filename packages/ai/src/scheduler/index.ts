/** Task occurrences and atomic claims are persisted; only the worker executes runs. */
import { CloudRunId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { cloudRun, cloudTask, user } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import { RUN_WALL_CLOCK, RuthCloud, RuthCloudError } from "../agents/cloud.ts";
import { nextOccurrence } from "./occurrence.ts";

export { nextOccurrence, validateSchedule } from "./occurrence.ts";
export { CloudTasks, CloudTasksLive } from "./tasks.ts";
export type { CloudTaskPatch, CloudTasksError } from "./tasks.ts";

export class CloudRuns extends Context.Service<
  CloudRuns,
  {
    readonly start: (runId: CloudRunId) => Effect.Effect<void>;
  }
>()("avenire/ai/CloudRuns") {}

export const CloudRunsLive = Layer.effect(
  CloudRuns,
  Effect.gen(function* () {
    const cloud = yield* RuthCloud;
    const database = yield* Database;
    const concurrency = Math.max(
      1,
      yield* Config.Int("RUTH_CLOUD_CONCURRENCY").pipe(Config.withDefault(2)),
    );
    const permits = yield* Semaphore.make(concurrency);
    const running = yield* FiberSet.make();
    // At most one run per user is ever claimed (see claimRun), so the user's single box,
    // token secret and run.json are never shared; this only bounds total concurrency.
    const execute = Effect.fn("CloudRuns.execute")(function* (runId: CloudRunId) {
      const run = yield* database.use((db) =>
        db.query.cloudRun.findFirst({ where: eq(cloudRun.id, runId) }),
      );
      if (!run || run.status === "cancelled") return;
      yield* cloud.execute(runId).pipe(permits.withPermits(1));
    });
    return CloudRuns.of({
      start: Effect.fn("CloudRuns.start")((runId) =>
        execute(runId).pipe(
          Effect.onExit((exit) =>
            Exit.isFailure(exit)
              ? database
                  .use((db) =>
                    db
                      .update(cloudRun)
                      .set(
                        Cause.hasInterrupts(exit.cause)
                          ? { status: "cancelled", finishedAt: sql`now()` }
                          : { status: "scheduled" },
                      )
                      .where(
                        and(
                          eq(cloudRun.id, runId),
                          eq(cloudRun.status, "provisioning"),
                          sql`${cloudRun.startedAt} is null`,
                        ),
                      ),
                  )
                  .pipe(
                    Effect.ignore({
                      log: "Error",
                      message: "Could not release an unstarted Cloud claim",
                    }),
                  )
              : Effect.void,
          ),
          Effect.catchCause((cause) => {
            const error = Cause.squash(cause);
            // SDK error causes can contain request credentials; only emit the sanitized domain reason.
            return Effect.logError("Ruth Cloud run failed", {
              runId,
              reason: error instanceof RuthCloudError ? error.reason : "Cloud executor failed.",
            });
          }),
          FiberSet.run(running),
          Effect.asVoid,
        ),
      ),
    });
  }),
);

/**
 * One active run per user: the user's box has one token secret and one run.json, so
 * runs of different tasks queue. Locking the user row serialises count + claim across
 * worker processes.
 */
export const MAX_ACTIVE_RUNS_PER_USER = 1;
/** A run still active this long after its claim belongs to a worker that died. */
const STALE_AFTER_MS = RUN_WALL_CLOCK + 30 * 60_000;

/** The user row serializes count + claim so distinct workers cannot exceed the cap. */
export const claimRun = Effect.fn("CloudScheduler.claimRun")(function* (
  runId: CloudRunId,
  userId: string,
  now: DateTime.Utc,
) {
  const database = yield* Database;
  const rows = yield* database.useTransaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("no key update");
    const active = await tx
      .select({ id: cloudRun.id })
      .from(cloudRun)
      .where(
        and(eq(cloudRun.userId, userId), inArray(cloudRun.status, ["provisioning", "running"])),
      );
    if (active.length >= MAX_ACTIVE_RUNS_PER_USER) return [];
    return tx
      .update(cloudRun)
      .set({ status: "provisioning", claimedAt: DateTime.toDateUtc(now) })
      .where(
        and(
          eq(cloudRun.id, runId),
          eq(cloudRun.userId, userId),
          eq(cloudRun.status, "scheduled"),
          lte(cloudRun.notBefore, DateTime.toDateUtc(now)),
        ),
      )
      .returning({ id: cloudRun.id });
  });
  return rows[0] ? Option.some(CloudRunId.make(rows[0].id)) : Option.none<CloudRunId>();
});

export const schedulerTick = Effect.fn("CloudScheduler.tick")(function* () {
  const database = yield* Database;
  const runs = yield* CloudRuns;
  const now = yield* DateTime.now;
  const date = DateTime.toDateUtc(now);
  // Otherwise a crashed worker's run would hold the user's only slot forever.
  yield* database.use((db) =>
    db
      .update(cloudRun)
      .set({
        status: "failed",
        error: "The worker stopped during this run.",
        finishedAt: date,
      })
      .where(
        and(
          inArray(cloudRun.status, ["provisioning", "running"]),
          lte(cloudRun.claimedAt, new Date(date.getTime() - STALE_AFTER_MS)),
        ),
      ),
  );
  const due = yield* database.use((db) =>
    db.query.cloudTask.findMany({
      where: and(eq(cloudTask.enabled, true), lte(cloudTask.nextRunAt, date)),
      orderBy: [asc(cloudTask.nextRunAt), asc(cloudTask.id)],
    }),
  );
  for (const task of due) {
    const id = yield* newId(CloudRunId);
    yield* database.useTransaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(cloudTask)
        .where(
          and(
            eq(cloudTask.id, task.id),
            eq(cloudTask.enabled, true),
            lte(cloudTask.nextRunAt, date),
          ),
        )
        .for("update", { skipLocked: true });
      if (!current?.nextRunAt) return;
      await tx
        .insert(cloudRun)
        .values({
          id,
          userId: current.userId,
          taskId: current.id,
          status: "scheduled",
          attempt: 1,
          scheduledFor: current.nextRunAt,
          notBefore: date,
        })
        .onConflictDoNothing({
          target: [cloudRun.taskId, cloudRun.scheduledFor, cloudRun.attempt],
        });
      // Coalesce missed cron occurrences after downtime, instead of flooding a user with catch-up digests.
      const next = nextOccurrence(current.schedule, current.timeZone, now);
      await tx
        .update(cloudTask)
        .set({
          nextRunAt: Option.isSome(next) ? DateTime.toDateUtc(next.value) : null,
          lastRunAt: current.nextRunAt,
          updatedAt: date,
        })
        .where(eq(cloudTask.id, current.id));
    });
  }
  const runnable = yield* database.use((db) =>
    db.query.cloudRun.findMany({
      where: and(eq(cloudRun.status, "scheduled"), lte(cloudRun.notBefore, date)),
      orderBy: [asc(cloudRun.notBefore), asc(cloudRun.id)],
    }),
  );
  for (const run of runnable) {
    // Claim + scope-owned fork must finish together even during worker shutdown.
    yield* Effect.gen(function* () {
      const claimed = yield* claimRun(CloudRunId.make(run.id), run.userId, now);
      if (Option.isSome(claimed)) yield* runs.start(claimed.value);
    }).pipe(Effect.uninterruptible);
  }
});

export const CloudSchedulerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const services = yield* Effect.context<Database | CloudRuns | Crypto.Crypto>();
    const tick = schedulerTick().pipe(
      Effect.provideContext(services),
      Effect.catchCause((cause) => Effect.logError("Ruth Cloud scheduler tick failed", { cause })),
    );
    yield* Effect.repeat(tick, Schedule.spaced("1 minute")).pipe(Effect.forkScoped);
  }),
);
