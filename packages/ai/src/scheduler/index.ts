/** Task occurrences and atomic claims are persisted; only the worker executes runs. */
import { CloudRunId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { cloudRun, cloudTask, user } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, eq, inArray, isNull, lte, sql, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
import { type CloudClaim, RuthCloud, RuthCloudError } from "../agents/cloud.ts";
import { nextOccurrence } from "./occurrence.ts";

export { nextOccurrence, validateSchedule } from "./occurrence.ts";
export { CloudTasks, CloudTasksLive } from "./tasks.ts";
export type { CloudTaskPatch, CloudTasksError } from "./tasks.ts";

export class CloudRuns extends Context.Service<
  CloudRuns,
  {
    readonly start: (claim: CloudClaim) => Effect.Effect<void>;
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
    // Claim fencing and checkpoints remain valid after worker shutdown.
    const execute = Effect.fn("CloudRuns.execute")(function* (claim: CloudClaim) {
      const run = yield* database.use((db) =>
        db.query.cloudRun.findFirst({ where: eq(cloudRun.id, claim.runId) }),
      );
      if (!run || (run.status === "cancelled" && !run.leasedBy)) return;
      yield* cloud.execute(claim).pipe(permits.withPermits(1));
    });
    return CloudRuns.of({
      start: Effect.fn("CloudRuns.start")((claim) =>
        execute(claim).pipe(
          Effect.onExit((exit) =>
            Exit.isFailure(exit)
              ? database
                  .use((db) =>
                    db
                      .update(cloudRun)
                      .set(
                        Cause.hasInterrupts(exit.cause)
                          ? { status: "scheduled", leaseExpiresAt: sql`now()`, leasedBy: null }
                          : { status: "scheduled" },
                      )
                      .where(
                        and(
                          eq(cloudRun.id, claim.runId),
                          eq(cloudRun.status, "provisioning"),
                          isNull(cloudRun.startedAt),
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
              runId: claim.runId,
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

/** Persistent boxes serialize runs by user across worker processes. */
export const MAX_ACTIVE_RUNS_PER_USER = 1;
export const RUN_LEASE_MS = 5 * 60_000;
const WORKER_ID = randomUUID();
export const leaseExpired = (expires: Date | null, now: Date) =>
  expires === null || expires.getTime() <= now.getTime();

/** The user row serializes count + claim so distinct workers cannot exceed the cap. */
export const claimRun = Effect.fn("CloudScheduler.claimRun")(function* (
  runId: CloudRunId,
  userId: string,
  now: DateTime.Utc,
) {
  const database = yield* Database;
  const rows = yield* database.useTransaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("no key update");
    const [candidate] = await tx
      .select()
      .from(cloudRun)
      .where(and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId)))
      .for("update");
    if (!candidate) return [];
    const cleanupOnly = ["succeeded", "failed", "cancelled"].includes(candidate.status);
    if (cleanupOnly && (!candidate.leasedBy || candidate.usage.cleanupComplete)) return [];
    const date = DateTime.toDateUtc(now);
    if (candidate.status === "scheduled" && candidate.notBefore > date) return [];
    if (candidate.status !== "scheduled" && !leaseExpired(candidate.leaseExpiresAt ?? null, date))
      return [];
    const otherRuns = await tx
      .select()
      .from(cloudRun)
      .where(and(eq(cloudRun.userId, userId), ne(cloudRun.id, runId)));
    const active = otherRuns.filter(
      (row) =>
        ["provisioning", "running"].includes(row.status) ||
        (row.leasedBy && !row.usage.cleanupComplete),
    );
    if (active.length >= MAX_ACTIVE_RUNS_PER_USER) return [];
    return tx
      .update(cloudRun)
      .set({
        status: cleanupOnly ? candidate.status : "provisioning",
        claimedAt: date,
        leasedBy: `${WORKER_ID}:${randomUUID()}`,
        heartbeatAt: date,
        leaseExpiresAt: DateTime.toDateUtc(DateTime.add(now, { milliseconds: RUN_LEASE_MS })),
      })
      .where(and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId)))
      .returning({ id: cloudRun.id, leasedBy: cloudRun.leasedBy });
  });
  const row = rows[0];
  return row?.leasedBy
    ? Option.some<CloudClaim>({ runId: CloudRunId.make(row.id), lease: row.leasedBy })
    : Option.none<CloudClaim>();
});

export const schedulerTick = Effect.fn("CloudScheduler.tick")(function* () {
  const database = yield* Database;
  const runs = yield* CloudRuns;
  const now = yield* DateTime.now;
  const date = DateTime.toDateUtc(now);
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
  const queued = yield* database.use((db) =>
    db.query.cloudRun.findMany({
      where: and(eq(cloudRun.status, "scheduled"), lte(cloudRun.notBefore, date)),
      orderBy: [asc(cloudRun.notBefore), asc(cloudRun.id)],
    }),
  );
  const active = yield* database.use((db) =>
    db.query.cloudRun.findMany({
      where: inArray(cloudRun.status, ["provisioning", "running"]),
      orderBy: [asc(cloudRun.createdAt)],
    }),
  );
  const finishing = yield* database.use((db) =>
    db.query.cloudRun.findMany({
      where: and(
        inArray(cloudRun.status, ["succeeded", "failed", "cancelled"]),
        sql`${cloudRun.leasedBy} is not null`,
      ),
      orderBy: [asc(cloudRun.createdAt)],
    }),
  );
  const expired = [...active, ...finishing];
  // Recovery has priority over new work and preserves sandbox, recorder, messages and tool ids.
  const runnable = [
    ...expired.filter(
      (run) =>
        (["provisioning", "running"].includes(run.status) ||
          (run.leasedBy && !run.usage.cleanupComplete)) &&
        leaseExpired(run.leaseExpiresAt ?? null, date),
    ),
    ...queued,
  ];
  for (const run of runnable) {
    // Claim + scope-owned fork must finish together even during worker shutdown.
    yield* Effect.gen(function* () {
      const claimed = yield* claimRun(CloudRunId.make(run.id), run.userId, now);
      if (Option.isSome(claimed)) yield* runs.start(claimed.value);
    }).pipe(Effect.uninterruptible);
  }
});

/** A queued run no other run of its user blocks; the web process enqueues these (ad-hoc runs). */
const claimableQueued = sql`${cloudRun.status} = 'scheduled' and ${cloudRun.notBefore} <= now()
  and not exists (
    select 1 from cloud_run other
    where other.user_id = ${cloudRun.userId} and other.id <> ${cloudRun.id}
      and (other.status in ('provisioning', 'running')
        or (other.leased_by is not null and coalesce(other.usage->>'cleanupComplete', 'false') <> 'true'))
  )`;
export const WAKE_INTERVAL = "2 seconds";

export const CloudSchedulerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const services = yield* Effect.context<Database | CloudRuns | Crypto.Crypto>();
    const database = yield* Database;
    const serial = yield* Semaphore.make(1);
    const tick = schedulerTick().pipe(
      Effect.provideContext(services),
      Effect.catchCause((cause) => Effect.logError("Ruth Cloud scheduler tick failed", { cause })),
      serial.withPermits(1),
    );
    // The minute tick is the safety net (due tasks, expired leases); this cheap poll starts a
    // run enqueued by the web process without waiting for it.
    const wake = database
      .use((db) => db.select({ id: cloudRun.id }).from(cloudRun).where(claimableQueued).limit(1))
      .pipe(
        Effect.flatMap((rows) => (rows.length ? tick : Effect.void)),
        Effect.catchCause((cause) => Effect.logWarning("Ruth Cloud queue poll failed", { cause })),
      );
    yield* Effect.repeat(tick, Schedule.spaced("1 minute")).pipe(Effect.forkScoped);
    yield* Effect.repeat(wake, Schedule.spaced(WAKE_INTERVAL)).pipe(Effect.forkScoped);
  }),
);
