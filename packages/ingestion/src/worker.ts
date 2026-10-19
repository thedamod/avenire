/**
 * The ingestion queue lives in the `ingestion_job` table. Workers claim jobs with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`), so several worker
 * processes can run side by side and a crashed worker's jobs are picked up again.
 */
import { IngestionJobId, type IngestionStatus, FileId, NotFound, UserId } from "@avenire/contracts";
import { Database, type DatabaseClient, type DatabaseTransaction } from "@avenire/database/client";
import { lockCorpus, advanceCorpusRevision } from "@avenire/database/corpus";
import { ingestionJob, file } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { claimPredicate, IngestionLeaseLost } from "./claim.ts";
import { IngestionPipeline } from "./pipeline.ts";

const MAX_ATTEMPTS = 3;
const IDLE_DELAY = "2 seconds";
const OUTAGE_DELAY = "10 seconds";

const IN_PROGRESS: ReadonlyArray<IngestionStatus> = [
  "extracting",
  "chunking",
  "embedding",
  "graphing",
  "foldering",
];

/** Minutes to wait before retrying a job that failed on its `attempts`-th try. */
export const retryDelayMinutes = (attempts: number): number => 2 ** attempts;

/** Queue inside the canonical mutation transaction; enqueues never clear an active claim. */
export const enqueueIngestionTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  id: IngestionJobId,
) => {
  const reset = { status: "queued" as const, attempts: 0, error: null };
  await tx
    .insert(ingestionJob)
    .values({ id, userId, fileId, ...reset })
    .onConflictDoUpdate({
      target: ingestionJob.fileId,
      set: {
        ...reset,
        generation: sql`${ingestionJob.generation} + 1`,
        // Status may already be queued by an earlier enqueue: lease state is independent.
        lockedUntil: sql`CASE WHEN ${ingestionJob.claimToken} IS NOT NULL
        AND ${ingestionJob.lockedUntil} > now() THEN ${ingestionJob.lockedUntil} ELSE NULL END`,
        updatedAt: sql`now()`,
      },
    });
};

export const enqueueIngestion = Effect.fn("Ingestion.enqueue")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const id = yield* newId(IngestionJobId);
  const owned = yield* database.useTransaction(async (tx) => {
    await lockCorpus(tx, userId);
    const [found] = await tx
      .select({ id: file.id })
      .from(file)
      .where(
        and(
          eq(file.id, fileId),
          eq(file.userId, userId),
          isNull(file.archivedAt),
          isNull(file.purgeStartedAt),
          ne(file.placement, "archived"),
        ),
      )
      .for("update");
    if (!found) return false;
    await enqueueIngestionTx(tx, userId, fileId, id);
    return true;
  });
  if (!owned) return yield* new NotFound({ entity: "File", id: fileId });
});

/** Mutable title and queued generation advance atomically; source extraction remains reusable. */
export const renameFile = Effect.fn("Ingestion.renameFile")(function* (
  userId: UserId,
  fileId: FileId,
  title: string,
) {
  const database = yield* Database;
  const id = yield* newId(IngestionJobId);
  const changed = yield* database.useTransaction(async (tx) => {
    await lockCorpus(tx, userId);
    const rows = await tx
      .update(file)
      .set({ title, updatedAt: sql`now()` })
      .where(
        and(
          eq(file.id, fileId),
          eq(file.userId, userId),
          isNull(file.archivedAt),
          isNull(file.purgeStartedAt),
          ne(file.placement, "archived"),
        ),
      )
      .returning({ id: file.id });
    if (!rows.length) return false;
    await enqueueIngestionTx(tx, userId, fileId, id);
    await advanceCorpusRevision(tx, userId);
    return true;
  });
  if (!changed) return yield* new NotFound({ entity: "File", id: fileId });
});

/** A job returned by the claim update. */
const ClaimedJob = Schema.Struct({
  id: IngestionJobId,
  userId: UserId,
  fileId: FileId,
  generation: Schema.Number,
  claimToken: Schema.String,
  attempts: Schema.Number,
});
type ClaimedJob = typeof ClaimedJob.Type;
const decodeClaimed = Schema.decodeUnknownEffect(Schema.Array(ClaimedJob));

/**
 * Leases up to `limit` jobs: queued ones whose retry delay has passed, plus
 * in-progress ones whose lease expired (their worker died).
 */
export const claimJobs = (db: DatabaseClient, limit: number, token: string) => {
  const due = db
    .select({ id: ingestionJob.id })
    .from(ingestionJob)
    .where(
      or(
        and(
          eq(ingestionJob.status, "queued"),
          or(isNull(ingestionJob.lockedUntil), lt(ingestionJob.lockedUntil, sql`now()`)),
        ),
        and(inArray(ingestionJob.status, IN_PROGRESS), lt(ingestionJob.lockedUntil, sql`now()`)),
      ),
    )
    .orderBy(ingestionJob.createdAt)
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(ingestionJob)
    .set({
      status: "extracting",
      claimToken: token,
      lockedUntil: sql`now() + interval '10 minutes'`,
      attempts: sql`${ingestionJob.attempts} + 1`,
      updatedAt: sql`now()`,
    })
    .where(inArray(ingestionJob.id, due))
    .returning({
      id: ingestionJob.id,
      userId: ingestionJob.userId,
      fileId: ingestionJob.fileId,
      generation: ingestionJob.generation,
      claimToken: ingestionJob.claimToken,
      attempts: ingestionJob.attempts,
    });
};

const failureReason = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : Cause.pretty(cause);
};

export const IngestionWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const pipeline = yield* IngestionPipeline;
    const concurrency = Math.max(
      1,
      yield* Config.Int("INGESTION_CONCURRENCY").pipe(Config.withDefault(2)),
    );

    const crypto = yield* Crypto.Crypto;
    const claim = crypto.randomUUIDv7.pipe(
      Effect.flatMap((token) => database.use((db) => claimJobs(db, concurrency, token))),
      Effect.flatMap(decodeClaimed),
      Effect.withSpan("IngestionWorker.claim"),
    );

    /** Re-queue with exponential backoff, or fail the job once it is out of attempts. */
    const recordFailure = (job: ClaimedJob, message: string) => {
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      return database.use((db) =>
        db
          .update(ingestionJob)
          .set({
            status: exhausted ? "failed" : "queued",
            error: message,
            claimToken: null,
            lockedUntil: exhausted
              ? null
              : sql`now() + (${retryDelayMinutes(job.attempts)} * interval '1 minute')`,
            updatedAt: sql`now()`,
          })
          .where(claimPredicate(job)),
      );
    };

    /** If the file was re-enqueued while this run held the lease, hand the lease back. */
    const releaseIfSuperseded = (job: ClaimedJob) =>
      database
        .use((db) =>
          db
            .update(ingestionJob)
            .set({ lockedUntil: null, claimToken: null })
            .where(
              and(
                eq(ingestionJob.id, job.id),
                eq(ingestionJob.claimToken, job.claimToken),
                ne(ingestionJob.generation, job.generation),
                eq(ingestionJob.status, "queued"),
              ),
            ),
        )
        .pipe(
          Effect.catchTags({
            DatabaseError: (error) =>
              Effect.logError("Could not release a superseded ingestion lease", error),
          }),
        );

    const handleFailure = (job: ClaimedJob, cause: Cause.Cause<unknown>) => {
      const reason = failureReason(cause);
      return Effect.logWarning("Ingestion failed", cause).pipe(
        Effect.annotateLogs({ jobId: job.id, attempts: job.attempts }),
        Effect.andThen(recordFailure(job, reason)),
        Effect.catchTag("DatabaseError", (error) =>
          Effect.logError("Could not record the ingestion failure", { jobId: job.id, error }),
        ),
      );
    };

    // Any failure, including a defect, counts as an attempt; otherwise a job that
    // crashes the pipeline would be re-claimed forever. Interruption (shutdown)
    // is left to the lease.
    const heartbeat = (job: ClaimedJob) =>
      database
        .use((db) =>
          db
            .update(ingestionJob)
            .set({ lockedUntil: sql`now() + interval '10 minutes'`, updatedAt: sql`now()` })
            .where(claimPredicate(job))
            .returning({ id: ingestionJob.id }),
        )
        .pipe(
          Effect.flatMap((rows) =>
            rows.length ? Effect.void : Effect.fail(new IngestionLeaseLost({ fileId: job.fileId })),
          ),
        );

    const runJob = (job: ClaimedJob) =>
      Effect.raceFirst(
        pipeline.run(job),
        Effect.repeat(heartbeat(job), Schedule.spaced("30 seconds")),
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : handleFailure(job, cause),
        ),
        Effect.andThen(releaseIfSuperseded(job)),
      );

    const pollOnce = claim.pipe(
      Effect.flatMap((jobs) =>
        jobs.length === 0
          ? Effect.sleep(IDLE_DELAY)
          : Effect.forEach(jobs, runJob, { concurrency, discard: true }),
      ),
      // Infrastructure failures (database down, ...) must not stop the worker.
      Effect.catchCause((cause) =>
        Effect.logError("Ingestion poll failed", cause).pipe(
          Effect.andThen(Effect.sleep(OUTAGE_DELAY)),
        ),
      ),
    );

    yield* Effect.forkScoped(Effect.repeat(pollOnce, Schedule.forever));
  }),
);
