/** Semantic cache: reuse a recent result for the same or a near-identical question. */
import { SearchResult, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { searchCache } from "@avenire/database/schema";
import { eq, type SQL, sql } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Embedder } from "../embed.ts";
import { toVectorLiteral } from "../text.ts";

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
    /** Drops the user's entries; call whenever their searchable corpus changes. */
    readonly invalidate: (userId: UserId) => Effect.Effect<void, SearchCacheError>;
  }
>()("avenire/ingestion/SemanticCache") {}

/** Entries live this long; the newest this many are kept per user. */
const TTL = sql`interval '24 hours'`;
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
    const lookup = (key: CacheKey, condition: SQL, distance: SQL, maxDistance: number) =>
      database
        .use((db) =>
          db.execute(sql`
            SELECT id, result, ${distance} AS distance FROM search_cache
            WHERE user_id = ${key.userId} AND options_key = ${key.optionsKey}
              AND embedding_model = ${embedder.model} AND expires_at > now() AND ${condition}
            ORDER BY distance, created_at DESC LIMIT 1`),
        )
        .pipe(
          Effect.flatMap(decodeRows),
          Effect.flatMap(([row]) =>
            row === undefined || row.distance > maxDistance
              ? Effect.succeedNone
              : decodeResult(row.result).pipe(
                  Effect.tap(() =>
                    database.use((db) =>
                      db.execute(sql`UPDATE search_cache SET hits = hits + 1 WHERE id = ${row.id}`),
                    ),
                  ),
                  Effect.map(Option.some),
                  Effect.catchTags({ SchemaError: () => Effect.succeedNone }),
                ),
          ),
          Effect.mapError((cause) => new SearchCacheError({ operation: "lookup", cause })),
        );

    const lookupExact = (key: CacheKey, queryText: string) =>
      lookup(key, sql`query_text = ${queryText}`, sql`0::float8`, 0);

    const lookupSimilar = (key: CacheKey, vector: ReadonlyArray<number>) =>
      lookup(
        key,
        sql`true`,
        sql`(embedding <=> ${toVectorLiteral(vector)}::vector)::float8`,
        1 - threshold,
      );

    const store = Effect.fn("SemanticCache.store")(
      function* (key: CacheKey, entry: Parameters<SemanticCache["Service"]["store"]>[1]) {
        const id = yield* crypto.randomUUIDv7;
        yield* database.useTransaction(async (tx) => {
          await tx.insert(searchCache).values({
            id,
            userId: key.userId,
            optionsKey: key.optionsKey,
            queryText: entry.queryText,
            embedding: [...entry.vector],
            embeddingModel: embedder.model,
            result: entry.result,
            expiresAt: sql`now() + ${TTL}`,
          });
          await tx.execute(sql`
            DELETE FROM search_cache WHERE user_id = ${key.userId} AND (expires_at <= now() OR id IN (
              SELECT id FROM search_cache WHERE user_id = ${key.userId}
              ORDER BY created_at DESC OFFSET ${MAX_ENTRIES_PER_USER}))`);
        });
      },
      Effect.mapError((cause) => new SearchCacheError({ operation: "store", cause })),
    );

    const invalidate = (userId: UserId) =>
      database
        .use((db) => db.delete(searchCache).where(eq(searchCache.userId, userId)))
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
