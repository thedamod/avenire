/**
 * Turns an file's extracted sections into its searchable index: chunks with
 * contextual embeddings, weighted lexical vectors and normalized text, plus the
 * file's knowledge graph. Unchanged chunks keep their rows, vectors and graph.
 */
import {
  ChunkId,
  FileEventId,
  FolderId,
  type StorageKey,
  type FileId,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { advanceCorpusRevision, lockCorpus } from "@avenire/database/corpus";
import { chunk, embeddingCache, file, fileEvent, ingestionJob } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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
import {
  type IngestionClaim,
  type SourceSnapshot,
  IngestionLeaseLost,
  ownsPublication,
} from "./claim.ts";
import { assignFoldersTx } from "./folder.ts";
import type { DatabaseTransaction } from "@avenire/database/client";
import { normalizeForMatch, sha256Hex } from "./text.ts";

export class IndexError extends Schema.TaggedError<IndexError>()("IndexError", {
  stage: Schema.Literals(["embedding", "writing", "graphing"]),
  fileId: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Indexing file ${this.fileId} failed while ${this.stage}`;
  }
}

export interface IndexInput {
  readonly userId: UserId;
  readonly fileId: FileId;
  /** Title used in contextual embedding text and the lexical vector (weight A). */
  readonly title: string;
  readonly sections: ReadonlyArray<ChunkSection>;
  readonly claim?: IngestionClaim;
  readonly source?: SourceSnapshot;
  /** Publish useful content while reserving the next extraction retry in the same commit. */
  readonly retryAfterMinutes?: number | undefined;
  /** An extracted object staged before publication; its pointer commits with the index. */
  readonly document?: {
    readonly key: StorageKey;
    readonly contentHash: string;
    readonly extractorVersion: number;
    readonly contentChanged: boolean;
  };
}

export interface IndexStats {
  readonly chunks: number;
  /** Chunks whose vectors had to be requested from the embedding model. */
  readonly embedded: number;
  readonly entities: number;
  readonly relations: number;
}

export class FileIndexer extends Context.Service<
  FileIndexer,
  {
    /**
     * Replaces the file's index with `input`'s. Provider calls happen before the
     * write, and the swap is one transaction, so a failure leaves the previous
     * index searchable. `onStage` reports progress to the caller (the job row).
     */
    readonly index: <E = never>(
      input: IndexInput,
      onStage?: (stage: "embedding" | "graphing") => Effect.Effect<void, E>,
    ) => Effect.Effect<IndexStats, IndexError | E>;
  }
>()("avenire/ingestion/FileIndexer") {}

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

export const FileIndexerLive = Layer.effect(
  FileIndexer,
  Effect.gen(function* () {
    const database = yield* Database;
    const embedder = yield* Embedder;
    const graphIndexer = yield* GraphIndexer;
    const crypto = yield* Crypto.Crypto;
    const chunkId = newId(ChunkId).pipe(Effect.provideService(Crypto.Crypto, crypto));

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
          .where(and(eq(chunk.userId, input.userId), eq(chunk.fileId, input.fileId))),
      );

    /**
     * Vectors by content hash: from the cache where possible, the rest from the
     * provider in one call. Fresh vectors are cached immediately, so a failed
     * write never pays for them twice.
     */
    const vectorsFor = Effect.fn("FileIndexer.vectorsFor")(function* (
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

    /** No remote calls occur after the fence: chunks, graph, metadata and folders publish together. */
    const write = (
      tx: DatabaseTransaction,
      input: IndexInput,
      diff: ReturnType<typeof planChunkDiff>,
      rows: ReadonlyArray<PgInsertValue<typeof chunk>>,
    ) =>
      (async () => {
        const owned = and(eq(chunk.userId, input.userId), eq(chunk.fileId, input.fileId));
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
        for (const batch of Arr.chunksOf(rows, BATCH_SIZE))
          await tx.insert(chunk).values([...batch]);
      })();

    const index = Effect.fn("FileIndexer.index")(function* <E>(
      input: IndexInput,
      onStage?: (stage: "embedding" | "graphing") => Effect.Effect<void, E>,
    ) {
      const failedWhile = (stage: IndexError["stage"]) =>
        Effect.mapError((cause: unknown) => new IndexError({ stage, fileId: input.fileId, cause }));

      const incoming = prepare(input);
      const existing = yield* loadExisting(input).pipe(failedWhile("writing"));
      const diff = planChunkDiff(existing, incoming, embedder.model);
      const changed = diff.added.length + diff.deleted.length + diff.moved.length > 0;
      const graphPending = diff.kept.filter((row) => !row.graphIndexed);
      const stats = { chunks: incoming.length, embedded: 0, entities: 0, relations: 0 };

      if (onStage) yield* onStage("embedding");
      const { vectors, embedded } = yield* vectorsFor(diff.added).pipe(failedWhile("embedding"));
      const rows = yield* Effect.forEach(diff.added, (value) =>
        Effect.map(chunkId, (id) => ({
          id,
          userId: input.userId,
          fileId: input.fileId,
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
      if (onStage) yield* onStage("graphing");
      const pending = [...graphPending, ...rows].map(({ id, content }) => ({
        id: ChunkId.make(id),
        content,
      }));
      const graph = yield* graphIndexer
        .prepareChunks({
          userId: input.userId,
          fileId: input.fileId,
          title: input.title,
          chunks: pending,
        })
        .pipe(failedWhile("graphing"));
      const newFolderId = yield* newId(FolderId).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        failedWhile("writing"),
      );
      const eventId = yield* newId(FileEventId).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        failedWhile("writing"),
      );
      const published = yield* database
        .useTransaction(async (tx) => {
          if (input.claim) {
            if (!(await ownsPublication(tx, input.claim, input.source))) return false;
          } else {
            await lockCorpus(tx, input.userId);
            const [owned] = await tx
              .select({ id: file.id })
              .from(file)
              .where(
                and(
                  eq(file.id, input.fileId),
                  eq(file.userId, input.userId),
                  isNull(file.archivedAt),
                  isNull(file.purgeStartedAt),
                  ne(file.placement, "archived"),
                ),
              )
              .for("update");
            if (!owned) return false;
          }
          if (changed) await write(tx, input, diff, rows);
          await graph.publish(tx);
          for (const ids of Arr.chunksOf(
            pending.map((row) => row.id),
            BATCH_SIZE,
          )) {
            await tx
              .update(chunk)
              .set({ graphIndexed: true })
              .where(
                and(
                  eq(chunk.userId, input.userId),
                  eq(chunk.fileId, input.fileId),
                  inArray(chunk.id, ids),
                ),
              );
          }
          if (input.document) {
            await tx
              .update(file)
              .set({
                contentHash: input.document.contentHash,
                documentKey: input.document.key,
                extractorVersion: input.document.extractorVersion,
                ...(input.document.contentChanged
                  ? { contentModifiedAt: sql`now()`, updatedAt: sql`now()` }
                  : {}),
              })
              .where(and(eq(file.id, input.fileId), eq(file.userId, input.userId)));
            if (input.document.contentChanged)
              await tx.insert(fileEvent).values({
                id: eventId,
                userId: input.userId,
                fileId: input.fileId,
                kind: "edited",
              });
          }
          await assignFoldersTx(tx, input.userId, input.fileId, input.title, newFolderId);
          // Revision, rather than best-effort deletion, defines cache validity.
          await advanceCorpusRevision(tx, input.userId);
          // Completion belongs to the same fenced commit as the searchable corpus.
          if (input.claim)
            await tx
              .update(ingestionJob)
              .set({
                // Searchable publication is complete even when OCR needs a later retry.
                status: "indexed",
                error:
                  input.retryAfterMinutes === undefined
                    ? null
                    : "Partial extraction; retry scheduled.",
                lockedUntil:
                  input.retryAfterMinutes === undefined
                    ? null
                    : sql`now() + (${input.retryAfterMinutes} * interval '1 minute')`,
                claimToken: null,
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  eq(ingestionJob.id, input.claim.id),
                  eq(ingestionJob.claimToken, input.claim.claimToken),
                  eq(ingestionJob.generation, input.claim.generation),
                ),
              );
          return true;
        })
        .pipe(failedWhile("writing"));
      if (!published)
        return yield* failedWhile("writing")(
          Effect.fail(new IngestionLeaseLost({ fileId: input.fileId })),
        );
      return { ...stats, embedded, ...graph.stats };
    });

    return FileIndexer.of({ index });
  }),
);
