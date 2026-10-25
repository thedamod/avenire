/** Writes an file's entities, mentions and relations. */
import type { ChunkId, FileId, UserId } from "@avenire/contracts";
import { Database, type DatabaseTransaction } from "@avenire/database/client";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";
import { entity, entityMention, entityRelation } from "@avenire/database/schema";
import { and, eq, exists, inArray, isNotNull, not, sql } from "drizzle-orm";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { Embedder } from "../embed.ts";
const excluded = (column: { readonly name: string }) =>
  sql`${sql.identifier("excluded")}.${sql.identifier(column.name)}`;
import {
  aggregateGraph,
  type AggregatedEntity,
  type AggregatedGraph,
  GraphError,
  GraphExtractor,
} from "./extract.ts";

export interface GraphIndexInput {
  readonly userId: UserId;
  readonly fileId: FileId;
  readonly title: string;
  readonly chunks: ReadonlyArray<{ readonly id: ChunkId; readonly content: string }>;
}

/** Provider work is prepared before the corpus transaction. Publication performs no remote calls. */
export interface PreparedGraph {
  readonly stats: { readonly entities: number; readonly relations: number };
  readonly publish: (tx: DatabaseTransaction) => Promise<void>;
}

export class GraphIndexer extends Context.Service<
  GraphIndexer,
  {
    readonly prepareChunks: (input: GraphIndexInput) => Effect.Effect<PreparedGraph, GraphError>;
    readonly indexChunks: (
      input: GraphIndexInput,
    ) => Effect.Effect<PreparedGraph["stats"], GraphError>;
  }
>()("avenire/ingestion/GraphIndexer") {}

/** Chunks per extraction request. */
const BATCH_CHUNKS = 2;

const entityText = (row: AggregatedEntity) => `${row.name} (${row.type}): ${row.description}`;

interface GraphWrite {
  readonly userId: UserId;
  readonly fileId: FileId;
  readonly chunkIds: ReadonlyArray<string>;
  /** Entities with the id to use if they turn out to be new. */
  readonly entities: ReadonlyArray<readonly [AggregatedEntity, string]>;
  readonly mentions: AggregatedGraph["mentions"];
  readonly relations: ReadonlyArray<readonly [AggregatedGraph["relations"][number], string]>;
  /** Fresh vectors by entity key; other entities keep the vector they have. */
  readonly vectors: ReadonlyMap<string, ReadonlyArray<number>>;
  readonly model: string;
}

/**
 * Replaces the graph of `chunkIds` (so a retried chunk never duplicates edges),
 * then prunes the user's entities that no chunk mentions any more.
 */
const writeGraph = async (tx: DatabaseTransaction, input: GraphWrite) => {
  const { userId, fileId } = input;
  if (input.chunkIds.length > 0) {
    const ofChunks = [...input.chunkIds];
    await tx
      .delete(entityRelation)
      .where(and(eq(entityRelation.userId, userId), inArray(entityRelation.chunkId, ofChunks)));
    await tx
      .delete(entityMention)
      .where(and(eq(entityMention.userId, userId), inArray(entityMention.chunkId, ofChunks)));
  }
  // On conflict the existing row (and its id) wins; RETURNING gives the id either way.
  const stored =
    input.entities.length === 0
      ? []
      : await tx
          .insert(entity)
          .values(
            input.entities.map(([row, id]) => {
              const vector = input.vectors.get(row.key);
              return {
                id,
                userId,
                key: row.key,
                name: row.name,
                type: row.type,
                description: row.description,
                embedding: vector ? [...vector] : null,
                embeddingModel: vector ? input.model : null,
              };
            }),
          )
          .onConflictDoUpdate({
            target: [entity.userId, entity.key],
            set: {
              description: sql`CASE WHEN length(${excluded(entity.description)}) > length(${entity.description})
                THEN ${excluded(entity.description)} ELSE ${entity.description} END`,
              embedding: sql`coalesce(${excluded(entity.embedding)}, ${entity.embedding})`,
              embeddingModel: sql`coalesce(${excluded(entity.embeddingModel)}, ${entity.embeddingModel})`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: entity.id, key: entity.key });
  const idOf = new Map(stored.map((row) => [row.key, row.id]));

  const mentions = input.mentions.flatMap(({ key, chunkId }) => {
    const entityId = idOf.get(key);
    return entityId === undefined ? [] : [{ entityId, chunkId, fileId, userId }];
  });
  if (mentions.length > 0) await tx.insert(entityMention).values(mentions).onConflictDoNothing();

  const relations = input.relations.flatMap(([row, id]) => {
    const sourceId = idOf.get(row.sourceKey);
    const targetId = idOf.get(row.targetKey);
    if (sourceId === undefined || targetId === undefined) return [];
    const { predicate, description, weight, chunkId } = row;
    return [{ id, userId, sourceId, targetId, predicate, description, weight, chunkId, fileId }];
  });
  if (relations.length > 0) await tx.insert(entityRelation).values(relations);

  await tx
    .delete(entity)
    .where(
      and(
        eq(entity.userId, userId),
        not(
          exists(
            tx
              .select({ entityId: entityMention.entityId })
              .from(entityMention)
              .where(eq(entityMention.entityId, entity.id)),
          ),
        ),
      ),
    );
};

export const GraphIndexerLive = Layer.effect(
  GraphIndexer,
  Effect.gen(function* () {
    const database = yield* Database;
    const extractor = yield* GraphExtractor;
    const embedder = yield* Embedder;
    const crypto = yield* Crypto.Crypto;
    const newIds = (count: number) => Effect.all(Arr.makeBy(count, () => crypto.randomUUIDv7));

    const extract = (title: string, chunks: ReadonlyArray<{ readonly content: string }>) =>
      Effect.forEach(
        Arr.chunksOf(chunks, BATCH_CHUNKS),
        (batch, batchIndex) =>
          extractor.extract({ title, chunks: batch.map((row) => row.content) }).pipe(
            Effect.map(({ chunks: entries }) =>
              entries.map((entry) => ({
                ...entry,
                index: entry.index + batchIndex * BATCH_CHUNKS,
              })),
            ),
          ),
        { concurrency: 1 },
      ).pipe(Effect.map((batches) => ({ chunks: batches.flat() })));

    /** Vectors for entities the user doesn't already have embedded with the current model. */
    const embedNew = Effect.fn("GraphIndexer.embedNew")(function* (
      userId: UserId,
      entities: ReadonlyArray<AggregatedEntity>,
    ) {
      const embedded =
        entities.length === 0
          ? []
          : yield* database.use((db) =>
              db
                .select({ key: entity.key })
                .from(entity)
                .where(
                  and(
                    eq(entity.userId, userId),
                    inArray(
                      entity.key,
                      entities.map((row) => row.key),
                    ),
                    eq(entity.embeddingModel, embedder.model),
                    isNotNull(entity.embedding),
                  ),
                ),
            );
      const done = new Set(embedded.map((row) => row.key));
      const missing = entities.filter((row) => !done.has(row.key));
      const vectors = yield* embedder.embedDocuments(missing.map(entityText));
      return new Map(missing.map((row, index) => [row.key, vectors[index] ?? []]));
    });

    const prepareChunks = Effect.fn("GraphIndexer.prepareChunks")(
      function* (input: GraphIndexInput) {
        const extracted = yield* extract(input.title, input.chunks);
        const graph = aggregateGraph(
          extracted,
          input.chunks.map((row) => row.id),
        );
        const vectors = yield* embedNew(input.userId, graph.entities);
        const entityIds = yield* newIds(graph.entities.length);
        const relationIds = yield* newIds(graph.relations.length);
        return {
          stats: { entities: graph.entities.length, relations: graph.relations.length },
          publish: (tx: DatabaseTransaction) =>
            writeGraph(tx, {
              userId: input.userId,
              fileId: input.fileId,
              chunkIds: input.chunks.map((row) => row.id),
              entities: Arr.zip(graph.entities, entityIds),
              mentions: graph.mentions,
              relations: Arr.zip(graph.relations, relationIds),
              vectors,
              model: embedder.model,
            }),
        };
      },
      Effect.catchTags({
        DatabaseError: (cause) => Effect.fail(new GraphError({ operation: "index", cause })),
        EmbeddingError: (cause) => Effect.fail(new GraphError({ operation: "index", cause })),
        PlatformError: (cause) => Effect.fail(new GraphError({ operation: "index", cause })),
      }),
    );

    const indexChunks = Effect.fn("GraphIndexer.indexChunks")(function* (input: GraphIndexInput) {
      const prepared = yield* prepareChunks(input);
      yield* database
        .useTransaction(async (tx) => {
          await lockCorpus(tx, input.userId);
          await prepared.publish(tx);
          await advanceCorpusRevision(tx, input.userId);
        })
        .pipe(Effect.mapError((cause) => new GraphError({ operation: "index", cause })));
      return prepared.stats;
    });
    return GraphIndexer.of({ indexChunks, prepareChunks });
  }),
);
