/** The graph retrieval lane: link the query to entities, then walk relations. */
import { ChunkId, ItemId, type GraphFact, type SearchQuery, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { type SQL, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { candidateFilter } from "../retrieval/lanes.ts";
import { toVectorLiteral } from "../text.ts";
import { entityKey, GraphError } from "./extract.ts";
import { advanceFrontier, type GraphEdge, mergeSeeds, rankGraph } from "./rank.ts";

/**
 * A search narrowed to items, times, kinds or clusters keeps the walk inside them, so
 * out-of-scope entities don't use up its budget. Unscoped searches skip these joins:
 * hits are filtered when their chunks are hydrated either way.
 */
const isScoped = (query: SearchQuery): boolean =>
  query.itemIds !== undefined ||
  query.since !== undefined ||
  query.until !== undefined ||
  (query.kinds?.length ?? 0) > 0 ||
  (query.clusterIds?.length ?? 0) > 0;

const chunkInScope = (userId: UserId, query: SearchQuery, chunkId: SQL): SQL =>
  isScoped(query)
    ? sql` AND EXISTS (SELECT 1 FROM chunk c JOIN item i ON i.id = c.item_id AND i.user_id = c.user_id
        WHERE c.id = ${chunkId} AND ${candidateFilter(userId, query)})`
    : sql``;

const mentionedInScope = (userId: UserId, query: SearchQuery): SQL =>
  isScoped(query)
    ? sql` AND EXISTS (SELECT 1 FROM entity_mention m
        WHERE m.entity_id = e.id AND m.user_id = ${userId}${chunkInScope(userId, query, sql`m.chunk_id`)})`
    : sql``;

export interface GraphMatches {
  /** Best first; chunks connecting several linked entities rank highest. */
  readonly chunkIds: ReadonlyArray<ChunkId>;
  /** Edges walked, best first. */
  readonly facts: ReadonlyArray<GraphFact>;
}

export class GraphSearch extends Context.Service<
  GraphSearch,
  {
    readonly search: (input: {
      readonly userId: UserId;
      readonly text: string;
      readonly query?: SearchQuery;
      /** The query's embedding, for linking it to entity descriptions. */
      readonly vector: ReadonlyArray<number>;
      readonly hops: 1 | 2;
      readonly limit: number;
    }) => Effect.Effect<GraphMatches, GraphError>;
  }
>()("avenire/ingestion/GraphSearch") {}

const SeedRow = Schema.Struct({ id: Schema.String, score: Schema.Number });
const EdgeRow = Schema.Struct({
  id: Schema.String,
  sourceId: Schema.String,
  targetId: Schema.String,
  sourceName: Schema.String,
  targetName: Schema.String,
  predicate: Schema.String,
  weight: Schema.Number,
  chunkId: Schema.String,
  itemId: Schema.String,
});
const MentionRow = Schema.Struct({ entityId: Schema.String, chunkId: Schema.String });
const decodeSeeds = Schema.decodeUnknownEffect(Schema.Array(SeedRow));
const decodeEdges = Schema.decodeUnknownEffect(Schema.Array(EdgeRow));
const decodeMentions = Schema.decodeUnknownEffect(Schema.Array(MentionRow));

const idList = (ids: ReadonlyArray<string>) =>
  sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );

/** Linked entities at most; the walk starts from these. */
const MAX_SEEDS = 10;
/** Nearest entities by embedding considered as seeds, and the similarity they need. */
const SEMANTIC_SEEDS = 8;
const MIN_SEED_SIMILARITY = 0.5;
/** Strongest relations followed per hop, and mentions read per entity. */
const EDGES_PER_HOP = 200;
const MENTIONS_PER_ENTITY = 20;

export const GraphSearchLive = Layer.effect(
  GraphSearch,
  Effect.gen(function* () {
    const database = yield* Database;

    /** Entities named in the query (whole words) or close to it in embedding space. */
    const findSeeds = (
      userId: UserId,
      text: string,
      vector: ReadonlyArray<number>,
      query: SearchQuery,
    ) =>
      database
        .useTransaction(async (tx) => {
          // Iterative scans keep the HNSW search going past other users' entities.
          await tx.execute(sql`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true),
            set_config('hnsw.ef_search', '200', true)`);
          return tx.execute(sql`
            WITH nearest AS MATERIALIZED (
              SELECT e.id, e.embedding <=> ${toVectorLiteral(vector)}::vector AS distance
              FROM entity AS e
              WHERE e.user_id = ${userId} AND e.embedding IS NOT NULL${mentionedInScope(userId, query)}
              ORDER BY distance LIMIT ${SEMANTIC_SEEDS}
            )
            SELECT e.id, 1.0::float8 AS score FROM entity AS e
            WHERE e.user_id = ${userId} AND length(e.key) >= 3${mentionedInScope(userId, query)}
              AND position(' ' || e.key || ' ' in ${` ${entityKey(text)} `}) > 0
            UNION ALL
            SELECT id, (1 - distance)::float8 AS score FROM nearest
            WHERE 1 - distance >= ${MIN_SEED_SIMILARITY}`);
        })
        .pipe(
          Effect.flatMap(decodeSeeds),
          Effect.map((seeds) => mergeSeeds(seeds, MAX_SEEDS)),
        );

    const edgesTouching = (userId: UserId, entityIds: ReadonlyArray<string>, query: SearchQuery) =>
      database
        .use((db) =>
          db.execute(sql`
            SELECT r.id, r.source_id AS "sourceId", r.target_id AS "targetId",
              source.name AS "sourceName", target.name AS "targetName",
              r.predicate, r.weight::float8 AS weight,
              r.chunk_id AS "chunkId", r.item_id AS "itemId"
            FROM entity_relation AS r
            JOIN entity AS source ON source.id = r.source_id
            JOIN entity AS target ON target.id = r.target_id
            WHERE r.user_id = ${userId}${chunkInScope(userId, query, sql`r.chunk_id`)}
              AND (r.source_id IN (${idList(entityIds)}) OR r.target_id IN (${idList(entityIds)}))
            ORDER BY r.weight DESC, r.id LIMIT ${EDGES_PER_HOP}`),
        )
        .pipe(Effect.flatMap(decodeEdges));

    const mentionsOf = (userId: UserId, entityIds: ReadonlyArray<string>, query: SearchQuery) =>
      database
        .use((db) =>
          db.execute(sql`
            SELECT "entityId", "chunkId" FROM (
              SELECT m.entity_id AS "entityId", m.chunk_id AS "chunkId",
                row_number() OVER (PARTITION BY m.entity_id ORDER BY m.chunk_id) AS rank
              FROM entity_mention AS m
              WHERE m.user_id = ${userId} AND m.entity_id IN (${idList(entityIds)})${chunkInScope(userId, query, sql`m.chunk_id`)}
            ) AS ranked WHERE rank <= ${MENTIONS_PER_ENTITY}`),
        )
        .pipe(Effect.flatMap(decodeMentions));

    const search = Effect.fn("GraphSearch.search")(
      function* (input: Parameters<GraphSearch["Service"]["search"]>[0]) {
        const query = input.query ?? { text: input.text };
        const seeds = yield* findSeeds(input.userId, input.text, input.vector, query);
        if (seeds.length === 0) return { chunkIds: [], facts: [] };

        let scores: ReadonlyMap<string, number> = new Map(
          seeds.map(({ id, score }) => [id, score]),
        );
        let frontier: ReadonlyArray<string> = seeds.map(({ id }) => id);
        const walked: Array<GraphEdge> = [];
        for (let hop = 0; hop < input.hops && frontier.length > 0; hop++) {
          const edges = yield* edgesTouching(input.userId, frontier, query);
          walked.push(...edges);
          ({ scores, frontier } = advanceFrontier(scores, frontier, edges));
        }
        const mentions = yield* mentionsOf(input.userId, [...scores.keys()], query);
        const ranked = rankGraph(scores, walked, mentions, input.limit);
        return {
          chunkIds: ranked.chunkIds.map((id) => ChunkId.make(id)),
          facts: ranked.facts.map((edge) => ({
            source: edge.sourceName,
            relation: edge.predicate,
            target: edge.targetName,
            chunkId: ChunkId.make(edge.chunkId),
            itemId: ItemId.make(edge.itemId),
          })),
        };
      },
      Effect.mapError((cause) => new GraphError({ operation: "search", cause })),
    );

    return GraphSearch.of({ search });
  }),
);
