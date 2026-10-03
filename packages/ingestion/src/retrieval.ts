/**
 * Hybrid retrieval over the user's chunks: pgvector cosine similarity plus Postgres
 * full-text search, fused with Reciprocal Rank Fusion. RRF only needs ranks, so the
 * two very different score scales never have to be calibrated against each other.
 */
import {
  ChunkId,
  ChunkKind,
  ChunkLocation,
  ItemId,
  ItemKind,
  type SearchHit,
  type SearchQuery,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { type SQL, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { Embedder } from "./embed.ts";

export class RetrievalError extends Schema.TaggedError<RetrievalError>()("RetrievalError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Search failed: ${detail}`;
  }
}

const CANDIDATES_PER_RANKER = 50;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
const RRF_K = 60;

export interface Ranked {
  readonly id: string;
  readonly score: number;
}

/** Fuse ranked id lists: each list contributes 1 / (k + rank) for every id it contains. */
export const reciprocalRankFusion = (
  rankings: ReadonlyArray<ReadonlyArray<string>>,
  k = RRF_K,
): ReadonlyArray<Ranked> => {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
};

/** A raw SQL row from SELECT_CANDIDATE (columns are aliased to camelCase). */
const CandidateRow = Schema.Struct({
  chunkId: ChunkId,
  itemId: ItemId,
  itemTitle: Schema.String,
  itemKind: ItemKind,
  chunkKind: ChunkKind,
  content: Schema.String,
  location: ChunkLocation,
});
const decodeCandidates = Schema.decodeUnknownEffect(Schema.Array(CandidateRow));

const list = (values: ReadonlyArray<string>) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

const filters = (userId: UserId, query: SearchQuery): SQL => {
  const kinds = query.kinds?.length ? sql` AND i.kind IN (${list(query.kinds)})` : sql``;
  const clusters = query.clusterIds?.length
    ? sql` AND EXISTS (
        SELECT 1 FROM item_cluster ic
        WHERE ic.item_id = i.id AND ic.user_id = ${userId}
          AND ic.cluster_id IN (${list(query.clusterIds)}))`
    : sql``;
  return sql`c.user_id = ${userId}${kinds}${clusters}`;
};

const SELECT_CANDIDATE = sql`
  SELECT c.id AS "chunkId", i.id AS "itemId", i.title AS "itemTitle", i.kind AS "itemKind",
         c.kind AS "chunkKind", c.content, c.location
  FROM chunk c JOIN item i ON i.id = c.item_id AND i.user_id = c.user_id`;

export class Retrieval extends Context.Service<
  Retrieval,
  {
    readonly search: (
      userId: UserId,
      query: SearchQuery,
    ) => Effect.Effect<ReadonlyArray<SearchHit>, RetrievalError>;
  }
>()("avenire/ingestion/Retrieval") {}

export const RetrievalLive = Layer.effect(
  Retrieval,
  Effect.gen(function* () {
    const database = yield* Database;
    const embedder = yield* Embedder;

    const semanticCandidates = (where: SQL, vector: ReadonlyArray<number>) =>
      database
        .use((db) =>
          db.execute(sql`${SELECT_CANDIDATE}
            WHERE ${where} AND c.embedding IS NOT NULL
            ORDER BY c.embedding <=> ${`[${vector.join(",")}]`}::vector
            LIMIT ${CANDIDATES_PER_RANKER}`),
        )
        .pipe(Effect.flatMap(decodeCandidates));

    const lexicalCandidates = (where: SQL, text: string) => {
      const tsQuery = sql`websearch_to_tsquery('english', ${text})`;
      return database
        .use((db) =>
          db.execute(sql`${SELECT_CANDIDATE}
            WHERE ${where} AND c.search @@ ${tsQuery}
            ORDER BY ts_rank_cd(c.search, ${tsQuery}) DESC
            LIMIT ${CANDIDATES_PER_RANKER}`),
        )
        .pipe(Effect.flatMap(decodeCandidates));
    };

    const search = Effect.fn("Retrieval.search")(
      function* (userId: UserId, query: SearchQuery) {
        const [queryVector = []] = yield* embedder.embedMany([query.text]);
        const where = filters(userId, query);
        const [semantic, lexical] = yield* Effect.all(
          [semanticCandidates(where, queryVector), lexicalCandidates(where, query.text)],
          { concurrency: 2 },
        );

        const byId = new Map([...semantic, ...lexical].map((row) => [row.chunkId, row]));
        const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
        const fused = reciprocalRankFusion([
          semantic.map((row) => row.chunkId),
          lexical.map((row) => row.chunkId),
        ]);
        return fused.slice(0, limit).flatMap(({ id, score }): ReadonlyArray<SearchHit> => {
          const row = byId.get(ChunkId.make(id));
          return row === undefined ? [] : [{ ...row, score }];
        });
      },
      Effect.mapError((cause) => new RetrievalError({ cause })),
    );

    return Retrieval.of({ search });
  }),
);
