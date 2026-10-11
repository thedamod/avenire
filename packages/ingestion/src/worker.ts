/**
 * The ingestion queue lives in the `ingestion_job` table. Workers claim jobs with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`), so several worker
 * processes can run side by side and a crashed worker's jobs are picked up again.
 */
import { IngestionJobId, type IngestionStatus, FileId, NotFound, UserId } from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { ingestionJob, file } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import * as Cause from "effect/Cause";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

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

/** Queue (or re-queue) an file for ingestion. Fails with NotFound if the user doesn't own it. */
export const enqueueIngestion = Effect.fn("Ingestion.enqueue")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const owned = yield* database.use((db) =>
    db.query.file.findFirst({
      columns: { id: true },
      where: and(eq(file.id, fileId), eq(file.userId, userId)),
    }),
  );
  if (owned === undefined) return yield* new NotFound({ entity: "File", id: fileId });
  const id = yield* newId(IngestionJobId);
  const reset = { status: "queued" as const, attempts: 0, error: null };
  yield* database.use((db) =>
    db
      .insert(ingestionJob)
      .values({ id, userId, fileId, ...reset })
      .onConflictDoUpdate({
        target: ingestionJob.fileId,
        set: {
          ...reset,
          generation: sql`${ingestionJob.generation} + 1`,
          // A running job keeps its lease, so the rerun waits for it instead of racing it.
          lockedUntil: sql`CASE WHEN ${inArray(ingestionJob.status, IN_PROGRESS)}
            THEN ${ingestionJob.lockedUntil} ELSE NULL END`,
          updatedAt: sql`now()`,
        },
      }),
  );
});

/** A job returned by the claim update. */
const ClaimedJob = Schema.Struct({
  id: IngestionJobId,
  userId: UserId,
  fileId: FileId,
  generation: Schema.Number,
  attempts: Schema.Number,
});
type ClaimedJob = typeof ClaimedJob.Type;
const decodeClaimed = Schema.decodeUnknownEffect(Schema.Array(ClaimedJob));

/**
 * Leases up to `limit` jobs: queued ones whose retry delay has passed, plus
 * in-progress ones whose lease expired (their worker died).
 */
export const claimJobs = (db: DatabaseClient, limit: number) => {
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

    const claim = database
      .use((db) => claimJobs(db, concurrency))
      .pipe(Effect.flatMap(decodeClaimed), Effect.withSpan("IngestionWorker.claim"));

    /** Re-queue with exponential backoff, or fail the job once it is out of attempts. */
    const recordFailure = (job: ClaimedJob, message: string) => {
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      return database.use((db) =>
        db
          .update(ingestionJob)
          .set({
            status: exhausted ? "failed" : "queued",
            error: message,
            lockedUntil: exhausted
              ? null
              : sql`now() + (${retryDelayMinutes(job.attempts)} * interval '1 minute')`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(ingestionJob.id, job.id), eq(ingestionJob.generation, job.generation))),
      );
    };

    /** If the file was re-enqueued while this run held the lease, hand the lease back. */
    const releaseIfSuperseded = (job: ClaimedJob) =>
      database
        .use((db) =>
          db
            .update(ingestionJob)
            .set({ lockedUntil: null })
            .where(
              and(
                eq(ingestionJob.id, job.id),
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
    const runJob = (job: ClaimedJob) =>
      pipeline.run(job).pipe(
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
