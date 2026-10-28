/**
 * The ingestion queue lives in the `ingestion_job` table. Workers claim jobs with
 * `FOR UPDATE SKIP LOCKED` and hold a lease (`locked_until`), so several worker
 * processes can run side by side and a crashed worker's jobs are picked up again.
 */
import { prettyWorkerCause } from "@avenire/shared/error-cause";
import {
  IngestionJobId,
  type IngestionStatus,
  FileId,
  NotFound,
  UserId,
  type SourceAccess,
} from "@avenire/contracts";
import { Database, type DatabaseClient, type DatabaseTransaction } from "@avenire/database/client";
import { lockCorpus, advanceCorpusRevision } from "@avenire/database/corpus";
import { ingestionJob, file } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Crypto from "effect/Crypto";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { failureAccess } from "./extract/access.ts";
import { claimPredicate, IngestionLeaseLost, ownsPublication } from "./claim.ts";
import { IngestionError, IngestionPipeline } from "./pipeline.ts";
import { graphRetryDelay } from "./graph/extract.ts";

const MAX_ATTEMPTS = 3;
const IDLE_DELAY = "2 seconds";
const OUTAGE_DELAY = "10 seconds";

/** Each free slot polls immediately, independently of slower jobs in the other slots. */
export const startIngestionLanes = <E, R>(
  concurrency: number,
  pollOnce: Effect.Effect<void, E, R>,
) =>
  Effect.forEach(
    Array.from({ length: concurrency }),
    () => Effect.forkScoped(Effect.repeat(pollOnce, Schedule.forever)),
    { discard: true },
  );

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
  background: Schema.optionalKey(Schema.Boolean),
});
type ClaimedJob = typeof ClaimedJob.Type;
const decodeClaimed = Schema.decodeUnknownEffect(Schema.Array(ClaimedJob));

/**
 * Leases up to `limit` jobs: queued ones whose retry delay has passed, plus
 * in-progress ones whose lease expired (their worker died).
 */
export const claimJobs = (db: DatabaseClient, limit: number, token: string, shortOnly = false) => {
  const due = db
    .select({ id: ingestionJob.id })
    .from(ingestionJob)
    .where(
      and(
        shortOnly
          ? sql`exists (select 1 from ${file} where ${file.id} = ${ingestionJob.fileId}
        and ${file.userId} = ${ingestionJob.userId} and ${file.kind} not in ('video', 'audio')
        and coalesce(${file.sizeBytes}, 0) <= 8388608)`
          : undefined,
        or(
          and(
            eq(ingestionJob.status, "queued"),
            or(isNull(ingestionJob.lockedUntil), lt(ingestionJob.lockedUntil, sql`now()`)),
          ),
          and(inArray(ingestionJob.status, IN_PROGRESS), lt(ingestionJob.lockedUntil, sql`now()`)),
          // An indexed source can still have a scheduled optional extraction retry.
          and(eq(ingestionJob.status, "indexed"), lt(ingestionJob.lockedUntil, sql`now()`)),
        ),
      ),
    )
    .orderBy(ingestionJob.createdAt)
    .limit(limit)
    .for("update", { skipLocked: true });
  return db
    .update(ingestionJob)
    .set({
      status: sql`CASE WHEN ${ingestionJob.status} = 'indexed' THEN 'indexed' ELSE 'extracting' END`,
      error: null,
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
      background: sql<boolean>`${ingestionJob.status} = 'indexed'`,
    });
};

export const failureReason = (cause: Cause.Cause<unknown>): string => {
  let error: unknown = Cause.squash(cause);
  const messages: string[] = [];
  const seen = new Set<unknown>();
  while (error && !seen.has(error)) {
    seen.add(error);
    if (error instanceof Error) messages.push(error.message);
    else if (typeof error === "string") messages.push(error);
    if (typeof error !== "object") break;
    const nested = error as { cause?: unknown; lastError?: unknown };
    error = nested.lastError ?? nested.cause;
  }
  const message = [...new Set(messages)].join(": ") || "Processing failed";
  // The same redactor used for worker logs also protects the persisted UI reason.
  return prettyWorkerCause(Cause.fail(new Error(message)))
    .split("\n")[0]!
    .replace(/^Error: /, "")
    .slice(0, 1000);
};

/** Unwrap stage errors to preserve the provider's quota-reset time in the durable queue. */
export const providerRetryDelay = (
  cause: Cause.Cause<unknown>,
  now: number,
): number | undefined => {
  let error: unknown = Cause.squash(cause);
  const seen = new Set<unknown>();
  while (error && !seen.has(error)) {
    seen.add(error);
    const delay = graphRetryDelay(error, now);
    if (delay !== undefined) return delay;
    if (typeof error !== "object") break;
    const nested = error as { cause?: unknown; lastError?: unknown };
    error = nested.lastError ?? nested.cause;
  }
  return undefined;
};

/** Access and failure state publish together under the same generation/token/lease fence. */
export const recordIngestionFailureTx = async (
  tx: DatabaseTransaction,
  job: ClaimedJob,
  message: string,
  retryAfterMs?: number,
  access?: SourceAccess,
): Promise<void> => {
  const deferred = retryAfterMs !== undefined;
  const exhausted = !deferred && job.attempts >= MAX_ATTEMPTS;

  if (!(await ownsPublication(tx, job))) return;
  if (access !== undefined)
    await tx
      .update(file)
      .set({ access })
      .where(and(eq(file.id, job.fileId), eq(file.userId, job.userId)));
  await tx
    .update(ingestionJob)
    .set({
      status: job.background ? "indexed" : exhausted ? "failed" : "queued",
      error: message,
      // Quota availability is not a failed processing attempt.
      attempts: deferred ? Math.max(0, job.attempts - 1) : job.attempts,
      claimToken: null,
      lockedUntil: deferred
        ? sql`now() + (${retryAfterMs + 1000} * interval '1 millisecond')`
        : exhausted
          ? null
          : sql`now() + (${retryDelayMinutes(job.attempts)} * interval '1 minute')`,
      updatedAt: sql`now()`,
    })
    .where(claimPredicate(job));
};

/**
 * Whether an `avenire_ingestion` notification can mean claimable work. Stage changes and
 * finished jobs say `claimable: false` (migration 0015); older payloads always wake.
 */
export const wakesWorker = (payload: string): boolean => {
  try {
    return (JSON.parse(payload) as { claimable?: unknown }).claimable !== false;
  } catch {
    return true;
  }
};

export const IngestionWorkerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const pipeline = yield* IngestionPipeline;
    const wakeups = yield* PubSub.sliding<string>(1);
    if (database.listen)
      yield* Effect.acquireRelease(
        Effect.tryPromise(() =>
          database.listen!("avenire_ingestion", (payload) => {
            if (wakesWorker(payload)) Effect.runFork(PubSub.publish(wakeups, payload));
          }),
        ).pipe(
          Effect.catch((error) =>
            Effect.as(Effect.logWarning("Ingestion wakeups unavailable", error), undefined),
          ),
        ),
        (listener) => (listener ? Effect.promise(() => listener.unlisten()) : Effect.void),
      );
    const idle = Effect.raceFirst(
      Effect.sleep(IDLE_DELAY),
      Stream.runHead(Stream.fromPubSub(wakeups)),
    ).pipe(Effect.asVoid);
    const concurrency = Math.max(
      1,
      yield* Config.Int("INGESTION_CONCURRENCY").pipe(Config.withDefault(2)),
    );
    const jobTimeoutSeconds = Math.max(
      1,
      yield* Config.Int("INGESTION_JOB_TIMEOUT_SECONDS").pipe(Config.withDefault(900)),
    );

    const crypto = yield* Crypto.Crypto;
    const claim = (shortOnly = false) =>
      crypto.randomUUIDv7.pipe(
        Effect.flatMap((token) => database.use((db) => claimJobs(db, 1, token, shortOnly))),
        Effect.flatMap(decodeClaimed),
        Effect.withSpan("IngestionWorker.claim"),
      );

    const recordFailure = (
      job: ClaimedJob,
      message: string,
      retryAfterMs?: number,
      access?: SourceAccess,
    ) =>
      database.useTransaction((tx) =>
        recordIngestionFailureTx(tx, job, message, retryAfterMs, access),
      );

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
      const error = Cause.squash(cause);
      if (error instanceof IngestionError && error.cause instanceof NotFound) {
        return database
          .use((db) =>
            db
              .update(ingestionJob)
              .set({
                status: "cancelled",
                error: null,
                claimToken: null,
                lockedUntil: null,
                updatedAt: sql`now()`,
              })
              .where(claimPredicate(job)),
          )
          .pipe(
            Effect.catchTag("DatabaseError", (failure) =>
              Effect.logError("Could not cancel ingestion for a removed file", {
                jobId: job.id,
                error: failure,
              }),
            ),
          );
      }
      if (
        error instanceof IngestionLeaseLost ||
        (error instanceof IngestionError && error.cause instanceof IngestionLeaseLost)
      )
        return Effect.void;
      const reason = failureReason(cause);
      return Clock.currentTimeMillis.pipe(
        Effect.flatMap((now) => {
          const delay = providerRetryDelay(cause, now);
          return Effect.logWarning(
            delay === undefined ? "Ingestion failed" : "Ingestion waiting for provider quota",
            prettyWorkerCause(cause),
          ).pipe(
            Effect.annotateLogs({ jobId: job.id, attempts: job.attempts }),
            Effect.andThen(recordFailure(job, reason, delay, failureAccess(error))),
            Effect.catchTag("DatabaseError", (error) =>
              Effect.logError("Could not record the ingestion failure", { jobId: job.id, error }),
            ),
          );
        }),
      );
    };

    // Any failure, including a defect, counts as an attempt; otherwise a job that
    // crashes the pipeline would be re-claimed forever. Shutdown releases its fenced claim.
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
        pipeline.run(job).pipe(
          Effect.timeout(`${jobTimeoutSeconds} seconds`),
          Effect.catchTag("TimeoutError", () =>
            Effect.fail(
              new IngestionError({
                stage: "processing",
                cause: `Processing exceeded ${jobTimeoutSeconds / 60} minutes. Try again after the provider recovers.`,
              }),
            ),
          ),
        ),
        Effect.repeat(heartbeat(job), Schedule.spaced("30 seconds")),
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : handleFailure(job, cause),
        ),
        Effect.onInterrupt(() =>
          database
            .use((db) =>
              db
                .update(ingestionJob)
                .set({
                  status: job.background ? "indexed" : "queued",
                  attempts: Math.max(0, job.attempts - 1),
                  claimToken: null,
                  lockedUntil: job.background ? sql`now()` : null,
                  updatedAt: sql`now()`,
                })
                .where(claimPredicate(job)),
            )
            .pipe(
              Effect.catchTag("DatabaseError", (error) =>
                Effect.logWarning("Could not release ingestion claim on shutdown", {
                  jobId: job.id,
                  error,
                }),
              ),
            ),
        ),
        Effect.andThen(releaseIfSuperseded(job)),
      );

    const pollOnce = (shortOnly = false) =>
      claim(shortOnly).pipe(
        Effect.flatMap((jobs) => (jobs.length === 0 ? idle : runJob(jobs[0]!))),
        // Infrastructure failures (database down, ...) must not stop the worker.
        Effect.catchCause((cause) =>
          Effect.logError("Ingestion poll failed", cause).pipe(
            Effect.andThen(Effect.sleep(OUTAGE_DELAY)),
          ),
        ),
      );

    yield* startIngestionLanes(Math.max(1, concurrency - 1), pollOnce());
    // Reserve capacity within the configured total, rather than multiplying provider calls.
    if (concurrency > 1) yield* startIngestionLanes(1, pollOnce(true));
  }),
);
