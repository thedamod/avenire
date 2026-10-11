/** The graph retrieval lane: link the query to entities, then walk relations. */
import { ChunkId, FileId, type GraphFact, type SearchQuery, type UserId } from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { chunk, entity, entityMention, entityRelation, file } from "@avenire/database/schema";
import {
  and,
  cosineDistance,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, unionAll } from "drizzle-orm/pg-core";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { candidateFilter } from "../retrieval/lanes.ts";
import { entityKey, GraphError } from "./extract.ts";
import { advanceFrontier, type GraphEdge, mergeSeeds, rankGraph } from "./rank.ts";

/**
 * A search narrowed to files, times, kinds or folders keeps the walk inside them, so
 * out-of-scope entities don't use up its budget. Unscoped searches skip these joins:
 * hits are filtered when their chunks are hydrated either way.
 */
const isScoped = (query: SearchQuery): boolean =>
  query.fileIds !== undefined ||
  query.since !== undefined ||
  query.until !== undefined ||
  (query.kinds?.length ?? 0) > 0 ||
  (query.folderIds?.length ?? 0) > 0;

const chunkInScope = (
  db: DatabaseClient,
  userId: UserId,
  query: SearchQuery,
  chunkId: typeof entityMention.chunkId | typeof entityRelation.chunkId,
): SQL | undefined =>
  isScoped(query)
    ? exists(
        db
          .select({ id: chunk.id })
          .from(chunk)
          .innerJoin(file, and(eq(file.id, chunk.fileId), eq(file.userId, chunk.userId)))
          .where(and(eq(chunk.id, chunkId), candidateFilter(userId, query))),
      )
    : undefined;
const mentionedInScope = (
  db: DatabaseClient,
  userId: UserId,
  query: SearchQuery,
): SQL | undefined =>
  isScoped(query)
    ? exists(
        db
          .select({ entityId: entityMention.entityId })
          .from(entityMention)
          .where(
            and(
              eq(entityMention.entityId, entity.id),
              eq(entityMention.userId, userId),
              chunkInScope(db, userId, query, entityMention.chunkId),
            ),
          ),
      )
    : undefined;

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
  fileId: Schema.String,
});
const MentionRow = Schema.Struct({ entityId: Schema.String, chunkId: Schema.String });
const decodeSeeds = Schema.decodeUnknownEffect(Schema.Array(SeedRow));
const decodeEdges = Schema.decodeUnknownEffect(Schema.Array(EdgeRow));
const decodeMentions = Schema.decodeUnknownEffect(Schema.Array(MentionRow));

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

    /** Entities named in the query or close to it in embedding space. */
    const findSeeds = (
      userId: UserId,
      text: string,
      vector: ReadonlyArray<number>,
      query: SearchQuery,
    ) =>
      database
        .useTransaction(async (tx) => {
          await tx.select({
            scan: sql`set_config('hnsw.iterative_scan', 'relaxed_order', true)`,
            ef: sql`set_config('hnsw.ef_search', '200', true)`,
          });
          const distance = cosineDistance(entity.embedding, [...vector]);
          const nearest = tx.$with("nearest").as(
            tx
              .select({ id: entity.id, distance: distance.as("distance") })
              .from(entity)
              .where(
                and(
                  eq(entity.userId, userId),
                  isNotNull(entity.embedding),
                  mentionedInScope(tx as DatabaseClient, userId, query),
                ),
              )
              .orderBy(distance)
              .limit(SEMANTIC_SEEDS),
          );
          const named = tx
            .select({ id: entity.id, score: sql<number>`1.0::float8`.as("score") })
            .from(entity)
            .where(
              and(
                eq(entity.userId, userId),
                sql`length(${entity.key}) >= 3`,
                mentionedInScope(tx as DatabaseClient, userId, query),
                sql`position(' ' || ${entity.key} || ' ' in ${` ${entityKey(text)} `}) > 0`,
              ),
            );
          const similar = tx
            .select({
              id: nearest.id,
              score: sql<number>`(1 - ${nearest.distance})::float8`.as("score"),
            })
            .from(nearest)
            .where(gte(sql<number>`1 - ${nearest.distance}`, MIN_SEED_SIMILARITY));
          const combined = tx.$with("combined").as(unionAll(named, similar));
          return tx
            .with(nearest, combined)
            .select({ id: combined.id, score: combined.score })
            .from(combined);
        })
        .pipe(
          Effect.flatMap(decodeSeeds),
          Effect.map((seeds) => mergeSeeds(seeds, MAX_SEEDS)),
        );

    const source = alias(entity, "source");
    const target = alias(entity, "target");
    const edgesTouching = (userId: UserId, entityIds: ReadonlyArray<string>, query: SearchQuery) =>
      database
        .use((db) =>
          db
            .select({
              id: entityRelation.id,
              sourceId: entityRelation.sourceId,
              targetId: entityRelation.targetId,
              sourceName: source.name,
              targetName: target.name,
              predicate: entityRelation.predicate,
              weight: sql<number>`${entityRelation.weight}::float8`,
              chunkId: entityRelation.chunkId,
              fileId: entityRelation.fileId,
            })
            .from(entityRelation)
            .innerJoin(source, eq(source.id, entityRelation.sourceId))
            .innerJoin(target, eq(target.id, entityRelation.targetId))
            .where(
              and(
                eq(entityRelation.userId, userId),
                chunkInScope(db, userId, query, entityRelation.chunkId),
                or(
                  inArray(entityRelation.sourceId, entityIds),
                  inArray(entityRelation.targetId, entityIds),
                ),
              ),
            )
            .orderBy(desc(entityRelation.weight), entityRelation.id)
            .limit(EDGES_PER_HOP),
        )
        .pipe(Effect.flatMap(decodeEdges));

    const mentionsOf = (userId: UserId, entityIds: ReadonlyArray<string>, query: SearchQuery) =>
      database
        .use((db) => {
          const ranked = db
            .select({
              entityId: entityMention.entityId,
              chunkId: entityMention.chunkId,
              rank: sql<number>`row_number() over (partition by ${entityMention.entityId} order by ${entityMention.chunkId})`.as(
                "rank",
              ),
            })
            .from(entityMention)
            .where(
              and(
                eq(entityMention.userId, userId),
                inArray(entityMention.entityId, entityIds),
                chunkInScope(db, userId, query, entityMention.chunkId),
              ),
            )
            .as("ranked");
          return db
            .select({ entityId: ranked.entityId, chunkId: ranked.chunkId })
            .from(ranked)
            .where(sql`${ranked.rank} <= ${MENTIONS_PER_ENTITY}`);
        })
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
            fileId: FileId.make(edge.fileId),
          })),
        };
      },
      Effect.mapError((cause) => new GraphError({ operation: "search", cause })),
    );

    return GraphSearch.of({ search });
  }),
);
