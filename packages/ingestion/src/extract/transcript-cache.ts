/** Durable checkpoints for transcribed audio clips. */
import { Database } from "@avenire/database/client";
import { transcriptCache } from "@avenire/database/schema";
import { and, eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { sha256Hex } from "../text.ts";
import type { TranscriptSegment } from "./transcribe.ts";

export class TranscriptCacheError extends Schema.TaggedError<TranscriptCacheError>()(
  "TranscriptCacheError",
  { operation: Schema.Literals(["lookup", "store"]), cause: Schema.Defect() },
) {
  override get message(): string {
    return `Transcript cache ${this.operation} failed`;
  }
}

export const transcriptCacheKey = (model: string, audio: Uint8Array) => ({
  model,
  contentHash: sha256Hex(audio),
});

export class TranscriptCache extends Context.Service<
  TranscriptCache,
  {
    readonly lookup: (
      model: string,
      audio: Uint8Array,
    ) => Effect.Effect<ReadonlyArray<TranscriptSegment> | undefined, TranscriptCacheError>;
    readonly store: (
      model: string,
      audio: Uint8Array,
      segments: ReadonlyArray<TranscriptSegment>,
    ) => Effect.Effect<void, TranscriptCacheError>;
  }
>()("avenire/ingestion/TranscriptCache") {}

export const TranscriptCacheLive = Layer.effect(
  TranscriptCache,
  Effect.gen(function* () {
    const database = yield* Database;
    const lookup = Effect.fn("TranscriptCache.lookup")(
      function* (model: string, audio: Uint8Array) {
        const key = transcriptCacheKey(model, audio);
        const rows = yield* database.use((db) =>
          db
            .select({ segments: transcriptCache.segments })
            .from(transcriptCache)
            .where(
              and(
                eq(transcriptCache.model, key.model),
                eq(transcriptCache.contentHash, key.contentHash),
              ),
            )
            .limit(1),
        );
        if (rows[0]) yield* Effect.logInfo("Transcript cache hit");
        return rows[0]?.segments;
      },
      Effect.mapError((cause) => new TranscriptCacheError({ operation: "lookup", cause })),
    );
    const store = Effect.fn("TranscriptCache.store")(
      function* (model: string, audio: Uint8Array, segments: ReadonlyArray<TranscriptSegment>) {
        const key = transcriptCacheKey(model, audio);
        yield* database.use((db) =>
          db
            .insert(transcriptCache)
            .values({ ...key, segments })
            .onConflictDoNothing(),
        );
      },
      Effect.mapError((cause) => new TranscriptCacheError({ operation: "store", cause })),
    );
    return TranscriptCache.of({ lookup, store });
  }),
);

export const TranscriptCacheTest = Layer.effect(
  TranscriptCache,
  Effect.sync(() => {
    const segments = new Map<string, ReadonlyArray<TranscriptSegment>>();
    const key = (model: string, audio: Uint8Array) => {
      const value = transcriptCacheKey(model, audio);
      return `${value.model}:${value.contentHash}`;
    };
    return TranscriptCache.of({
      lookup: (model, audio) => Effect.succeed(segments.get(key(model, audio))),
      store: (model, audio, value) =>
        Effect.sync(() => {
          segments.set(key(model, audio), value);
        }),
    });
  }),
);
