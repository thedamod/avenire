/**
 * The ingestion queue lives in the `ingestion_job` table. Workers claim jobs with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`), so several worker
 * processes can run side by side and a crashed worker's jobs are picked up again.
 */
import { IngestionJobId, type ItemId, NotFound, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { type IngestionJobRow, ingestionJob, item } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { IngestionPipeline } from "./pipeline.ts";

const MAX_ATTEMPTS = 3;
const IN_PROGRESS = sql`('extracting', 'chunking', 'embedding', 'clustering')`;

/** Minutes to wait before retrying a job that failed on its `attempts`-th try. */
export const retryDelayMinutes = (attempts: number): number => 2 ** attempts;

/** Queue (or re-queue) an item for ingestion. Fails with NotFound if the user doesn't own it. */
export const enqueueIngestion = Effect.fn("Ingestion.enqueue")(function* (userId: UserId, itemId: ItemId) {
  const database = yield* Database;
  const owned = yield* database.use((db) =>
    db.query.item.findFirst({ columns: { id: true }, where: and(eq(item.id, itemId), eq(item.userId, userId)) }),
  );
  if (owned === undefined) return yield* new NotFound({ entity: "Item", id: itemId });
  const id = yield* newId(IngestionJobId);
  const reset = { status: "queued" as const, attempts: 0, error: null, lockedUntil: null };
  yield* database.use((db) =>
    db
      .insert(ingestionJob)
      .values({ id, userId, itemId, ...reset })
      .onConflictDoUpdate({ target: ingestionJob.itemId, set: { ...reset, updatedAt: sql`now()` } }),
  );
});

const claimJobs = (limit: number) => sql`
  WITH candidates AS (
    SELECT id FROM ingestion_job
    WHERE (status = 'queued' AND (locked_until IS NULL OR locked_until < now()))
       OR (status IN ${IN_PROGRESS} AND locked_until < now())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  )
  UPDATE ingestion_job AS job
  SET status = 'extracting', locked_until = now() + interval '10 minutes',
      attempts = job.attempts + 1, updated_at = now()
  FROM candidates WHERE job.id = candidates.id
  RETURNING job.*
`;

export const IngestionWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const pipeline = yield* IngestionPipeline;
    const concurrency = Math.max(1, yield* Config.Int("INGESTION_CONCURRENCY").pipe(Config.withDefault(2)));

    const claim = database.use(async (db) => {
      const rows = await db.execute(claimJobs(concurrency));
      // postgres-js returns snake_case columns for raw SQL; map them onto the drizzle row type.
      return rows.map(
        (row): IngestionJobRow => ({
          id: String(row.id),
          userId: String(row.user_id),
          itemId: String(row.item_id),
          status: "extracting",
          attempts: Number(row.attempts),
          error: null,
          lockedUntil: null,
          createdAt: new Date(String(row.created_at)),
          updatedAt: new Date(String(row.updated_at)),
        }),
      );
    });

    const recordFailure = (job: IngestionJobRow, message: string) => {
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      return database.use((db) =>
        db
          .update(ingestionJob)
          .set({
            status: exhausted ? "failed" : "queued",
            error: message,
            lockedUntil: exhausted ? null : sql`now() + (${retryDelayMinutes(job.attempts)} * interval '1 minute')`,
            updatedAt: sql`now()`,
          })
          .where(eq(ingestionJob.id, job.id)),
      );
    };

    const runJob = (job: IngestionJobRow) =>
      pipeline.run(job).pipe(
        Effect.catchTag("IngestionError", (error) =>
          Effect.logWarning("Ingestion failed", { jobId: job.id, attempts: job.attempts, error: error.message }).pipe(
            Effect.andThen(recordFailure(job, error.message)),
          ),
        ),
      );

    const pollOnce = claim.pipe(
      Effect.flatMap((jobs) =>
        jobs.length === 0
          ? Effect.sleep("2 seconds")
          : Effect.forEach(jobs, runJob, { concurrency, discard: true }),
      ),
      // Infrastructure failures (database down, ...) must not stop the worker.
      Effect.catchCause((cause) =>
        Effect.logError("Ingestion poll failed", cause).pipe(Effect.andThen(Effect.sleep("10 seconds"))),
      ),
    );

    yield* Effect.forkScoped(Effect.repeat(pollOnce, Schedule.forever));
  }),
);
