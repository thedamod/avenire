/**
 * Durable per-run event log. The worker executes; delivery is separate: the executor appends
 * AI SDK UI message chunks here in batches, and the stream routes replay then tail them.
 * Polling (not LISTEN/NOTIFY) keeps every stream a plain indexed read: no connection per viewer,
 * nothing to lose on reconnect, and the log is the only state a resumed client needs.
 */
import { NotFound, type CloudRunId, type UserId } from "@avenire/contracts";
import { Database, type DatabaseError } from "@avenire/database/client";
import { cloudRun, cloudRunEvent } from "@avenire/database/schema";
import type { UIMessageChunk } from "ai";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

/** Another writer holds this run's sequence: the executor lost its lease. */
export class RunEventConflict extends Schema.TaggedError<RunEventConflict>()("RunEventConflict", {
  runId: Schema.String,
}) {}

const POLL_INTERVAL = "400 millis";
const PAGE_SIZE = 500;

/** Merge consecutive deltas of one part so a token stream becomes a handful of rows. */
export const coalesceChunks = (chunks: ReadonlyArray<UIMessageChunk>): UIMessageChunk[] => {
  const out: UIMessageChunk[] = [];
  for (const chunk of chunks) {
    const last = out.at(-1);
    if (
      last &&
      !("providerMetadata" in last && last.providerMetadata) &&
      !("providerMetadata" in chunk && chunk.providerMetadata)
    ) {
      if (
        (chunk.type === "text-delta" || chunk.type === "reasoning-delta") &&
        last.type === chunk.type &&
        last.id === chunk.id
      ) {
        out[out.length - 1] = { ...last, delta: last.delta + chunk.delta };
        continue;
      }
      if (
        chunk.type === "tool-input-delta" &&
        last.type === "tool-input-delta" &&
        last.toolCallId === chunk.toolCallId
      ) {
        out[out.length - 1] = {
          ...last,
          inputTextDelta: last.inputTextDelta + chunk.inputTextDelta,
        };
        continue;
      }
    }
    out.push(chunk);
  }
  return out;
};

export interface RunEventWriter {
  /** Appends `start` once per run; a resumed executor continues the existing message. */
  readonly begin: Effect.Effect<void, RunEventConflict>;
  /** Delivery is best effort: a failed batch is logged and dropped, never fails the run. */
  readonly append: (chunks: ReadonlyArray<UIMessageChunk>) => Effect.Effect<void, RunEventConflict>;
  /** Ends the stream. Idempotent: only the first terminal row is written. */
  readonly end: (chunks: ReadonlyArray<UIMessageChunk>) => Effect.Effect<void, RunEventConflict>;
}

/** One writer per executing run: the lease holder owns the sequence. */
export const makeRunEventWriter = Effect.fn("CloudRunEvents.writer")(function* (runId: CloudRunId) {
  const database = yield* Database;
  const [last] = yield* database.use((db) =>
    db
      .select({ max: sql<number>`coalesce(max(${cloudRunEvent.seq}), -1)` })
      .from(cloudRunEvent)
      .where(eq(cloudRunEvent.runId, runId)),
  );
  let next = (last?.max ?? -1) + 1;
  const write = (chunks: ReadonlyArray<UIMessageChunk>, terminal: boolean) =>
    Effect.gen(function* () {
      const batch = coalesceChunks(chunks);
      if (!batch.length) return;
      const rows = batch.map((chunk, index) => ({
        runId,
        seq: next + index,
        chunk,
        terminal: terminal && index === batch.length - 1,
      }));
      const inserted = yield* database
        .use((db) =>
          db.insert(cloudRunEvent).values(rows).onConflictDoNothing().returning({
            seq: cloudRunEvent.seq,
          }),
        )
        .pipe(
          Effect.catchTag("DatabaseError", (error) =>
            Effect.logWarning("Cloud run events were dropped", { runId, error }).pipe(
              Effect.as(undefined),
            ),
          ),
        );
      if (inserted === undefined) return;
      if (inserted.length !== rows.length && !terminal)
        return yield* new RunEventConflict({ runId });
      next += rows.length;
    });
  return {
    begin: Effect.suspend(() =>
      next > 0 ? Effect.void : write([{ type: "start", messageId: runId }], false),
    ),
    append: (chunks) => write(chunks, false),
    end: Effect.fn("CloudRunEvents.end")(function* (chunks) {
      const prior = yield* database
        .use((db) =>
          db
            .select({ seq: cloudRunEvent.seq })
            .from(cloudRunEvent)
            .where(and(eq(cloudRunEvent.runId, runId), eq(cloudRunEvent.terminal, true))),
        )
        .pipe(Effect.catchTag("DatabaseError", () => Effect.succeed([{ seq: -1 }])));
      if (prior.length) return;
      yield* write(chunks, true);
    }),
  } satisfies RunEventWriter;
});

/** The tail of a run whose executor never wrote a terminal row (cancelled while queued, crashed). */
export const closingChunks = (
  status: string,
  error: string | null,
): ReadonlyArray<UIMessageChunk> =>
  status === "cancelled"
    ? [{ type: "abort", reason: "The run was cancelled." }]
    : status === "failed"
      ? [{ type: "error", errorText: error ?? "The run failed." }, { type: "finish" }]
      : [{ type: "finish" }];

const FINISHED = new Set(["succeeded", "failed", "cancelled"]);

export class CloudRunEvents extends Context.Service<
  CloudRunEvents,
  {
    /**
     * Replays the run's chunks from sequence `from`, then tails until the terminal row. Chunks map
     * one-to-one onto sequence numbers, so a client that counts them can resume at its count.
     * Fails with NotFound unless the run is the user's.
     */
    readonly stream: (
      userId: UserId,
      runId: CloudRunId,
      from?: number,
    ) => Effect.Effect<ReadableStream<UIMessageChunk>, NotFound | DatabaseError>;
  }
>()("avenire/ai/CloudRunEvents") {}

export const CloudRunEventsLive = Layer.effect(
  CloudRunEvents,
  Effect.gen(function* () {
    const database = yield* Database;
    const page = (runId: CloudRunId, from: number) =>
      database.use((db) =>
        db
          .select({
            seq: cloudRunEvent.seq,
            chunk: cloudRunEvent.chunk,
            terminal: cloudRunEvent.terminal,
          })
          .from(cloudRunEvent)
          .where(and(eq(cloudRunEvent.runId, runId), gte(cloudRunEvent.seq, from)))
          .orderBy(asc(cloudRunEvent.seq))
          .limit(PAGE_SIZE),
      );
    const owned = (userId: UserId, runId: CloudRunId) =>
      database.use((db) =>
        db.query.cloudRun.findFirst({
          columns: { status: true, error: true },
          where: and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId)),
        }),
      );
    const poll = (userId: UserId, runId: CloudRunId) => (cursor: number) =>
      Effect.gen(function* () {
        while (true) {
          const rows = yield* page(runId, cursor);
          if (rows.length) {
            const end = rows.findIndex((row) => row.terminal);
            const taken = end === -1 ? rows : rows.slice(0, end + 1);
            return [
              taken.map((row) => row.chunk),
              end === -1 ? Option.some(rows[rows.length - 1]!.seq + 1) : Option.none<number>(),
            ] as const;
          }
          const run = yield* owned(userId, runId);
          if (!run) return [[], Option.none<number>()] as const;
          if (FINISHED.has(run.status)) {
            // Events are written before the status flips; one more read closes that race.
            const settled = yield* page(runId, cursor);
            if (settled.length) continue;
            return [closingChunks(run.status, run.error), Option.none<number>()] as const;
          }
          yield* Effect.sleep(POLL_INTERVAL);
        }
      }).pipe(Effect.retry({ times: 10, schedule: Schedule.spaced("1 second") }));
    return CloudRunEvents.of({
      stream: Effect.fn("CloudRunEvents.stream")(function* (userId, runId, from = 0) {
        const run = yield* owned(userId, runId);
        if (!run) return yield* new NotFound({ entity: "CloudRun", id: runId });
        return Stream.toReadableStream(
          Stream.paginate(Math.max(0, Math.floor(from)), poll(userId, runId)),
        );
      }),
    });
  }),
);
