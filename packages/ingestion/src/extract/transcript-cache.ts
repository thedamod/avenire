/** Short-lived, source-owned checkpoints for successful audio clips. */
import type { FileId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { lockCorpus } from "@avenire/database/corpus";
import { file, transcriptCache } from "@avenire/database/schema";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
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

/** A clip is reusable only by its owning source. Unowned extraction never persists text. */
export interface TranscriptScope {
  readonly userId: UserId;
  readonly fileId: FileId;
}

export const TRANSCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class TranscriptCache extends Context.Service<
  TranscriptCache,
  {
    readonly lookup: (
      model: string,
      audio: Uint8Array,
      scope?: TranscriptScope,
    ) => Effect.Effect<ReadonlyArray<TranscriptSegment> | undefined, TranscriptCacheError>;
    readonly store: (
      model: string,
      audio: Uint8Array,
      segments: ReadonlyArray<TranscriptSegment>,
      scope?: TranscriptScope,
    ) => Effect.Effect<void, TranscriptCacheError>;
  }
>()("avenire/ingestion/TranscriptCache") {}

export const TranscriptCacheLive = Layer.effect(
  TranscriptCache,
  Effect.gen(function* () {
    const database = yield* Database;
    const lookup = Effect.fn("TranscriptCache.lookup")(
      function* (model: string, audio: Uint8Array, scope?: TranscriptScope) {
        if (scope === undefined) return undefined;
        const key = transcriptCacheKey(model, audio);
        const rows = yield* database.use((db) =>
          db
            .select({ segments: transcriptCache.segments })
            .from(transcriptCache)
            .innerJoin(
              file,
              and(eq(file.id, transcriptCache.fileId), eq(file.userId, transcriptCache.userId)),
            )
            .where(
              and(
                eq(transcriptCache.model, key.model),
                eq(transcriptCache.contentHash, key.contentHash),
                eq(transcriptCache.userId, scope.userId),
                eq(transcriptCache.fileId, scope.fileId),
                gt(transcriptCache.expiresAt, sql`now()`),
                isNull(file.purgeStartedAt),
                isNull(file.archivedAt),
                ne(file.placement, "archived"),
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
      function* (
        model: string,
        audio: Uint8Array,
        segments: ReadonlyArray<TranscriptSegment>,
        scope?: TranscriptScope,
      ) {
        if (scope === undefined) return;
        const key = transcriptCacheKey(model, audio);
        yield* database.useTransaction(async (tx) => {
          // Match the user -> file lock order of archive, publication and account deletion.
          await lockCorpus(tx, scope.userId);
          const [owner] = await tx
            .select({ id: file.id })
            .from(file)
            .where(
              and(
                eq(file.id, scope.fileId),
                eq(file.userId, scope.userId),
                isNull(file.purgeStartedAt),
                isNull(file.archivedAt),
                ne(file.placement, "archived"),
              ),
            )
            .for("update");
          if (owner === undefined) return;
          await tx
            .insert(transcriptCache)
            .values({
              ...scope,
              ...key,
              segments,
              expiresAt: sql`now() + interval '24 hours'`,
            })
            .onConflictDoUpdate({
              target: [
                transcriptCache.userId,
                transcriptCache.fileId,
                transcriptCache.model,
                transcriptCache.contentHash,
              ],
              set: { segments, expiresAt: sql`now() + interval '24 hours'` },
            });
        });
      },
      Effect.mapError((cause) => new TranscriptCacheError({ operation: "store", cause })),
    );
    return TranscriptCache.of({ lookup, store });
  }),
);

export const TranscriptCacheTest = Layer.effect(
  TranscriptCache,
  Effect.sync(() => {
    const segments = new Map<
      string,
      { readonly value: ReadonlyArray<TranscriptSegment>; readonly expiresAt: number }
    >();
    const key = (model: string, audio: Uint8Array, scope: TranscriptScope) => {
      const value = transcriptCacheKey(model, audio);
      return JSON.stringify([scope.userId, scope.fileId, value.model, value.contentHash]);
    };
    return TranscriptCache.of({
      lookup: (model, audio, scope) =>
        Effect.gen(function* () {
          if (scope === undefined) return undefined;
          const entry = segments.get(key(model, audio, scope));
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          return entry !== undefined && entry.expiresAt > now ? entry.value : undefined;
        }),
      store: (model, audio, value, scope) =>
        Effect.gen(function* () {
          if (scope === undefined) return;
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          segments.set(key(model, audio, scope), {
            value,
            expiresAt: now + TRANSCRIPT_CACHE_TTL_MS,
          });
        }),
    });
  }),
);
