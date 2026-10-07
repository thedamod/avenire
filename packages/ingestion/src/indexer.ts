/**
 * Turns an item's extracted sections into its searchable index: chunks with
 * contextual embeddings, weighted lexical vectors and normalized text, plus the
 * item's knowledge graph. Unchanged chunks keep their rows, vectors and graph.
 */
import { ChunkId, type ItemId, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, embeddingCache } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgInsertValue } from "drizzle-orm/pg-core";
import * as Arr from "effect/Array";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { type Chunk, type ChunkSection, chunkSections, embeddingText } from "./chunk.ts";
import { Embedder } from "./embed.ts";
import { GraphIndexer } from "./graph/indexer.ts";
import { SemanticCache } from "./retrieval/cache.ts";
import { normalizeForMatch, sha256Hex } from "./text.ts";

export class IndexError extends Schema.TaggedError<IndexError>()("IndexError", {
  stage: Schema.Literals(["embedding", "writing", "graphing"]),
  itemId: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Indexing item ${this.itemId} failed while ${this.stage}`;
  }
}

export interface IndexInput {
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** Title used in contextual embedding text and the lexical vector (weight A). */
  readonly title: string;
  readonly sections: ReadonlyArray<ChunkSection>;
}

export interface IndexStats {
  readonly chunks: number;
  /** Chunks whose vectors had to be requested from the embedding model. */
  readonly embedded: number;
  readonly entities: number;
  readonly relations: number;
}

export class ItemIndexer extends Context.Service<
  ItemIndexer,
  {
    /**
     * Replaces the item's index with `input`'s. Provider calls happen before the
     * write, and the swap is one transaction, so a failure leaves the previous
     * index searchable. `onStage` reports progress to the caller (the job row).
     */
    readonly index: <E = never>(
      input: IndexInput,
      onStage?: (stage: "embedding" | "graphing") => Effect.Effect<void, E>,
    ) => Effect.Effect<IndexStats, IndexError | E>;
  }
>()("avenire/ingestion/ItemIndexer") {}

type IncomingChunk = Chunk & {
  /** The contextual text that is embedded; `contentHash` is its SHA-256. */
  readonly text: string;
  readonly contentHash: string;
  readonly contentNorm: string;
};

type ExistingChunk = Pick<Chunk, "ordinal" | "kind" | "location" | "content"> & {
  readonly id: string;
  readonly contentHash: string;
  readonly embeddingModel: string | null;
  readonly graphIndexed: boolean;
};

const prepare = (input: IndexInput): ReadonlyArray<IncomingChunk> =>
  chunkSections(input.sections).map((value) => {
    const text = embeddingText(input.title, value);
    return {
      ...value,
      text,
      contentHash: sha256Hex(text),
      contentNorm: normalizeForMatch(value.content),
    };
  });

const samePlace = (existing: ExistingChunk, incoming: IncomingChunk): boolean =>
  existing.ordinal === incoming.ordinal &&
  existing.kind === incoming.kind &&
  existing.location.page === incoming.location.page &&
  existing.location.heading === incoming.location.heading &&
  existing.location.startSec === incoming.location.startSec &&
  existing.location.endSec === incoming.location.endSec;

/**
 * Matches incoming chunks to stored rows with the same hash and embedding model,
 * each row at most once. Matched rows are kept (`moved` when their position or
 * location changed), unmatched incoming chunks are `added`, leftover rows `deleted`.
 */
export const planChunkDiff = (
  existing: ReadonlyArray<ExistingChunk>,
  incoming: ReadonlyArray<IncomingChunk>,
  model: string,
) => {
  const available = Map.groupBy(
    existing.filter((row) => row.embeddingModel === model),
    (row) => row.contentHash,
  );
  const kept: Array<ExistingChunk> = [];
  const moved: Array<{ readonly id: string; readonly chunk: IncomingChunk }> = [];
  const added: Array<IncomingChunk> = [];
  for (const value of incoming) {
    const match = available.get(value.contentHash)?.shift();
    if (match === undefined) {
      added.push(value);
      continue;
    }
    kept.push(match);
    if (!samePlace(match, value)) moved.push({ id: match.id, chunk: value });
  }
  const keptIds = new Set(kept.map((row) => row.id));
  return { kept, moved, added, deleted: existing.filter((row) => !keptIds.has(row.id)) };
};

/** Rows per statement, well under Postgres' bind-parameter limit. */
const BATCH_SIZE = 500;

const searchVector = (title: string, value: Chunk) =>
  sql`setweight(to_tsvector('english', ${title}), 'A')
    || setweight(to_tsvector('english', ${value.location.heading ?? ""}), 'B')
    || setweight(to_tsvector('english', ${value.content}), 'D')`;

export const ItemIndexerLive = Layer.effect(
  ItemIndexer,
  Effect.gen(function* () {
    const database = yield* Database;
    const embedder = yield* Embedder;
    const graphIndexer = yield* GraphIndexer;
    const semanticCache = yield* SemanticCache;
    const chunkId = newId(ChunkId).pipe(Effect.provideService(Crypto.Crypto, yield* Crypto.Crypto));

    const loadExisting = (input: IndexInput) =>
      database.use((db) =>
        db
          .select({
            id: chunk.id,
            ordinal: chunk.ordinal,
            kind: chunk.kind,
            location: chunk.location,
            content: chunk.content,
            contentHash: chunk.contentHash,
            embeddingModel: chunk.embeddingModel,
            graphIndexed: chunk.graphIndexed,
          })
          .from(chunk)
          .where(and(eq(chunk.userId, input.userId), eq(chunk.itemId, input.itemId))),
      );

    /**
     * Vectors by content hash: from the cache where possible, the rest from the
     * provider in one call. Fresh vectors are cached immediately, so a failed
     * write never pays for them twice.
     */
    const vectorsFor = Effect.fn("ItemIndexer.vectorsFor")(function* (
      chunks: ReadonlyArray<IncomingChunk>,
    ) {
      const hashes = [...new Set(chunks.map((value) => value.contentHash))];
      const cached = yield* Effect.forEach(Arr.chunksOf(hashes, BATCH_SIZE), (batch) =>
        database.use((db) =>
          db
            .select({
              contentHash: embeddingCache.contentHash,
              embedding: embeddingCache.embedding,
            })
            .from(embeddingCache)
            .where(
              and(
                eq(embeddingCache.model, embedder.model),
                inArray(embeddingCache.contentHash, batch),
              ),
            ),
        ),
      );
      const vectors = new Map(cached.flat().map((row) => [row.contentHash, row.embedding]));
      const misses = [
        ...new Map(
          chunks
            .filter((value) => !vectors.has(value.contentHash))
            .map((value) => [value.contentHash, value]),
        ).values(),
      ];
      const embedded = yield* embedder.embedDocuments(misses.map((value) => value.text));
      const fresh = misses.map((value, index) => ({
        model: embedder.model,
        contentHash: value.contentHash,
        embedding: [...(embedded[index] ?? [])],
      }));
      yield* Effect.forEach(Arr.chunksOf(fresh, BATCH_SIZE), (batch) =>
        database.use((db) =>
          db
            .insert(embeddingCache)
            .values([...batch])
            .onConflictDoNothing(),
        ),
      );
      for (const row of fresh) vectors.set(row.contentHash, row.embedding);
      return { vectors, embedded: fresh.length };
    });

    /** Applies the diff in one transaction, so readers see the old index or the new one. */
    const write = (
      input: IndexInput,
      diff: ReturnType<typeof planChunkDiff>,
      rows: ReadonlyArray<PgInsertValue<typeof chunk>>,
    ) =>
      database.useTransaction(async (tx) => {
        const owned = and(eq(chunk.userId, input.userId), eq(chunk.itemId, input.itemId));
        // Statements on one transaction run one after another anyway.
        /* eslint-disable no-await-in-loop */
        for (const ids of Arr.chunksOf(
          diff.deleted.map((row) => row.id),
          BATCH_SIZE,
        )) {
          await tx.delete(chunk).where(and(owned, inArray(chunk.id, ids)));
        }
        for (const { id, chunk: value } of diff.moved) {
          await tx
            .update(chunk)
            .set({ ordinal: value.ordinal, kind: value.kind, location: value.location })
            .where(and(owned, eq(chunk.id, id)));
        }
        for (const batch of Arr.chunksOf(rows, BATCH_SIZE)) {
          await tx.insert(chunk).values([...batch]);
        }
        /* eslint-enable no-await-in-loop */
      });

    /** Extracts the graph for chunks that don't have one yet, then marks them done. */
    const indexGraph = Effect.fn("ItemIndexer.indexGraph")(function* (
      input: IndexInput,
      chunks: ReadonlyArray<{ readonly id: string; readonly content: string }>,
    ) {
      const graph = yield* graphIndexer.indexChunks({
        userId: input.userId,
        itemId: input.itemId,
        title: input.title,
        chunks: chunks.map(({ id, content }) => ({ id: ChunkId.make(id), content })),
      });
      yield* Effect.forEach(
        Arr.chunksOf(
          chunks.map(({ id }) => id),
          BATCH_SIZE,
        ),
        (ids) =>
          database.use((db) =>
            db.update(chunk).set({ graphIndexed: true }).where(inArray(chunk.id, ids)),
          ),
      );
      return graph;
    });

    const index = Effect.fn("ItemIndexer.index")(function* <E>(
      input: IndexInput,
      onStage?: (stage: "embedding" | "graphing") => Effect.Effect<void, E>,
    ) {
      const failedWhile = (stage: IndexError["stage"]) =>
        Effect.mapError((cause: unknown) => new IndexError({ stage, itemId: input.itemId, cause }));

      const incoming = prepare(input);
      const existing = yield* loadExisting(input).pipe(failedWhile("writing"));
      const diff = planChunkDiff(existing, incoming, embedder.model);
      const changed = diff.added.length + diff.deleted.length + diff.moved.length > 0;
      const graphPending = diff.kept.filter((row) => !row.graphIndexed);
      const stats = { chunks: incoming.length, embedded: 0, entities: 0, relations: 0 };
      if (!changed && graphPending.length === 0) return stats;

      if (onStage) yield* onStage("embedding");
      const { vectors, embedded } = yield* vectorsFor(diff.added).pipe(failedWhile("embedding"));
      const rows = yield* Effect.forEach(diff.added, (value) =>
        Effect.map(chunkId, (id) => ({
          id,
          userId: input.userId,
          itemId: input.itemId,
          ordinal: value.ordinal,
          kind: value.kind,
          content: value.content,
          location: value.location,
          tokenCount: value.tokenCount,
          contentHash: value.contentHash,
          contentNorm: value.contentNorm,
          embedding: vectors.get(value.contentHash) ?? null,
          embeddingModel: embedder.model,
          search: searchVector(input.title, value),
        })),
      ).pipe(failedWhile("writing"));
      if (changed) {
        yield* write(input, diff, rows).pipe(failedWhile("writing"));
        yield* semanticCache.invalidate(input.userId).pipe(failedWhile("writing"));
      }

      if (onStage) yield* onStage("graphing");
      // Runs after the swap: the graph references chunk rows. Chunks it hasn't
      // finished stay `graph_indexed = false` and are picked up by the next run.
      const graph = yield* indexGraph(input, [...graphPending, ...rows]).pipe(
        failedWhile("graphing"),
      );
      return { ...stats, embedded, ...graph };
    });

    return ItemIndexer.of({ index });
  }),
);
