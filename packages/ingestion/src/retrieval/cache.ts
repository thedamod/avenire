/** Semantic cache: reuse a recent result for the same or a near-identical question. */
import { SearchResult, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";
import { searchCache, user } from "@avenire/database/schema";
import { and, cosineDistance, desc, eq, gt, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Embedder } from "../embed.ts";

export class SearchCacheError extends Schema.TaggedError<SearchCacheError>()("SearchCacheError", {
  operation: Schema.Literals(["lookup", "store", "invalidate"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Search cache ${this.operation} failed`;
  }
}

export interface CacheKey {
  readonly userId: UserId;
  readonly corpusRevision: number;
  /** Fingerprint of everything but the wording: filters, limit, depth, locations, phrases. */
  readonly optionsKey: string;
}

export class SemanticCache extends Context.Service<
  SemanticCache,
  {
    /** An unexpired result for the same normalized text, without embedding it. */
    readonly lookupExact: (
      key: CacheKey,
      queryText: string,
    ) => Effect.Effect<Option.Option<SearchResult>, SearchCacheError>;
    /** An unexpired result whose query embedding is within the similarity threshold. */
    readonly lookupSimilar: (
      key: CacheKey,
      vector: ReadonlyArray<number>,
    ) => Effect.Effect<Option.Option<SearchResult>, SearchCacheError>;
    readonly store: (
      key: CacheKey,
      entry: {
        readonly queryText: string;
        readonly vector: ReadonlyArray<number>;
        readonly result: SearchResult;
      },
    ) => Effect.Effect<void, SearchCacheError>;
    /** Compatibility invalidation. Canonical mutations advance revision in their own transaction. */
    readonly invalidate: (userId: UserId) => Effect.Effect<void, SearchCacheError>;
  }
>()("avenire/ingestion/SemanticCache") {}

/** Entries live this long; the newest this many are kept per user. */
const MAX_ENTRIES_PER_USER = 500;

const CachedRow = Schema.Struct({
  id: Schema.String,
  result: Schema.Unknown,
  distance: Schema.Number,
});
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(CachedRow));
const decodeResult = Schema.decodeUnknownEffect(SearchResult);

export const SemanticCacheLive = Layer.effect(
  SemanticCache,
  Effect.gen(function* () {
    const database = yield* Database;
    const embedder = yield* Embedder;
    const crypto = yield* Crypto.Crypto;
    const threshold = yield* Config.Number("SEARCH_CACHE_SIMILARITY").pipe(
      Config.withDefault(0.95),
    );

    /**
     * The best unexpired entry for `key` matching `condition`, ordered by `distance`.
     * An entry whose result no longer decodes is a miss.
     */
    const lookup = (
      key: CacheKey,
      condition: SQL | undefined,
      distance: SQL,
      maxDistance: number,
    ) =>
      database
        .use((db) =>
          db
            .select({ id: searchCache.id, result: searchCache.result, distance })
            .from(searchCache)
            .where(
              and(
                eq(searchCache.userId, key.userId),
                eq(searchCache.corpusRevision, key.corpusRevision),
                sql`${key.corpusRevision} = (SELECT ${user.corpusRevision} FROM ${user} WHERE ${user.id} = ${key.userId})`,
                eq(searchCache.optionsKey, key.optionsKey),
                eq(searchCache.embeddingModel, embedder.model),
                gt(searchCache.expiresAt, sql`now()`),
                condition,
              ),
            )
            .orderBy(distance, desc(searchCache.createdAt))
            .limit(1),
        )
        .pipe(
          Effect.flatMap(decodeRows),
          Effect.flatMap(([row]) =>
            row === undefined || row.distance > maxDistance
              ? Effect.succeedNone
              : decodeResult(row.result).pipe(
                  Effect.tap(() =>
                    database.use((db) =>
                      db
                        .update(searchCache)
                        .set({ hits: sql`${searchCache.hits} + 1` })
                        .where(eq(searchCache.id, row.id)),
                    ),
                  ),
                  Effect.map(Option.some),
                  Effect.catchTags({ SchemaError: () => Effect.succeedNone }),
                ),
          ),
          Effect.mapError((cause) => new SearchCacheError({ operation: "lookup", cause })),
        );

    const lookupExact = (key: CacheKey, queryText: string) =>
      lookup(key, eq(searchCache.queryText, queryText), sql<number>`0::float8`, 0);

    const lookupSimilar = (key: CacheKey, vector: ReadonlyArray<number>) =>
      lookup(key, undefined, cosineDistance(searchCache.embedding, [...vector]), 1 - threshold);

    const store = Effect.fn("SemanticCache.store")(
      function* (key: CacheKey, entry: Parameters<SemanticCache["Service"]["store"]>[1]) {
        const id = yield* crypto.randomUUIDv7;
        yield* database.useTransaction(async (tx) => {
          await lockCorpus(tx, key.userId);
          const current = await tx.query.user.findFirst({
            columns: { corpusRevision: true },
            where: eq(user.id, key.userId),
          });
          // A search started before mutation cannot repopulate the current cache.
          if (!current || current.corpusRevision !== key.corpusRevision) return;
          await tx.insert(searchCache).values({
            id,
            userId: key.userId,
            corpusRevision: key.corpusRevision,
            optionsKey: key.optionsKey,
            queryText: entry.queryText,
            embedding: [...entry.vector],
            embeddingModel: embedder.model,
            result: entry.result,
            expiresAt: sql`now() + interval '24 hours'`,
          });
          const overflow = tx
            .select({ id: searchCache.id })
            .from(searchCache)
            .where(eq(searchCache.userId, key.userId))
            .orderBy(desc(searchCache.createdAt))
            .offset(MAX_ENTRIES_PER_USER);
          await tx
            .delete(searchCache)
            .where(
              and(
                eq(searchCache.userId, key.userId),
                or(lte(searchCache.expiresAt, sql`now()`), inArray(searchCache.id, overflow)),
              ),
            );
        });
      },
      Effect.mapError((cause) => new SearchCacheError({ operation: "store", cause })),
    );

    const invalidate = (userId: UserId) =>
      database
        .useTransaction(async (tx) => {
          await advanceCorpusRevision(tx, userId);
          await tx.delete(searchCache).where(eq(searchCache.userId, userId));
        })
        .pipe(
          Effect.asVoid,
          Effect.mapError((cause) => new SearchCacheError({ operation: "invalidate", cause })),
        );

    return SemanticCache.of({
      lookupExact: Effect.fn("SemanticCache.lookupExact")(lookupExact),
      lookupSimilar: Effect.fn("SemanticCache.lookupSimilar")(lookupSimilar),
      store,
      invalidate: Effect.fn("SemanticCache.invalidate")(invalidate),
    });
  }),
);
