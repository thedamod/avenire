/**
 * The ingestion queue lives in the `ingestion_job` table. Workers claim jobs with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`), so several worker
 * processes can run side by side and a crashed worker's jobs are picked up again.
 */
import { IngestionJobId, ItemId, NotFound, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { ingestionJob, item } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
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

/** Minutes to wait before retrying a job that failed on its `attempts`-th try. */
export const retryDelayMinutes = (attempts: number): number => 2 ** attempts;

/** Queue (or re-queue) an item for ingestion. Fails with NotFound if the user doesn't own it. */
export const enqueueIngestion = Effect.fn("Ingestion.enqueue")(function* (
  userId: UserId,
  itemId: ItemId,
) {
  const database = yield* Database;
  const owned = yield* database.use((db) =>
    db.query.item.findFirst({
      columns: { id: true },
      where: and(eq(item.id, itemId), eq(item.userId, userId)),
    }),
  );
  if (owned === undefined) return yield* new NotFound({ entity: "Item", id: itemId });
  const id = yield* newId(IngestionJobId);
  const reset = { status: "queued" as const, attempts: 0, error: null, lockedUntil: null };
  yield* database.use((db) =>
    db
      .insert(ingestionJob)
      .values({ id, userId, itemId, ...reset })
      .onConflictDoUpdate({
        target: ingestionJob.itemId,
        set: { ...reset, updatedAt: sql`now()` },
      }),
  );
});

/** A job as returned by the claim query (raw SQL, so columns are aliased to camelCase). */
const ClaimedJob = Schema.Struct({
  id: IngestionJobId,
  userId: UserId,
  itemId: ItemId,
  attempts: Schema.Number,
});
type ClaimedJob = typeof ClaimedJob.Type;
const decodeClaimed = Schema.decodeUnknownEffect(Schema.Array(ClaimedJob));

/**
 * Leases up to `limit` jobs: queued ones whose retry delay has passed, plus
 * in-progress ones whose lease expired (their worker died).
 */
const claimJobs = (limit: number) => sql`
  WITH candidates AS (
    SELECT id FROM ingestion_job
    WHERE (status = 'queued' AND (locked_until IS NULL OR locked_until < now()))
       OR (status IN ('extracting', 'chunking', 'embedding', 'clustering')
           AND locked_until < now())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  )
  UPDATE ingestion_job AS job
  SET status = 'extracting', locked_until = now() + interval '10 minutes',
      attempts = job.attempts + 1, updated_at = now()
  FROM candidates WHERE job.id = candidates.id
  RETURNING job.id, job.user_id AS "userId", job.item_id AS "itemId", job.attempts
`;

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
      .use((db) => db.execute(claimJobs(concurrency)))
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
          .where(eq(ingestionJob.id, job.id)),
      );
    };

    const handleFailure = (job: ClaimedJob, cause: Cause.Cause<unknown>) => {
      const reason = failureReason(cause);
      return Effect.logWarning("Ingestion failed", {
        jobId: job.id,
        attempts: job.attempts,
        error: reason,
      }).pipe(
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
      pipeline
        .run(job)
        .pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : handleFailure(job, cause),
          ),
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
