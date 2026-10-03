/**
 * One ingestion run: load -> extract -> chunk -> embed -> persist -> cluster.
 * Each stage is persisted on the job so the inbox can show progress, and chunk
 * writes replace the item's previous chunks so re-ingestion is idempotent.
 */
import {
  ChunkId,
  type IngestionJobId,
  type IngestionStatus,
  type ItemId,
  NotFound,
  StorageKey,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, ingestionJob, item, type ItemRow } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { Storage } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { type Chunk, chunkSections } from "./chunk.ts";
import { assignClusters, meanVector } from "./cluster.ts";
import { Embedder } from "./embed.ts";
import { extract } from "./extract/index.ts";

export class IngestionError extends Schema.TaggedError<IngestionError>()("IngestionError", {
  stage: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Ingestion failed while ${this.stage}: ${detail}`;
  }
}

/** The job a pipeline run works on, as claimed from the queue. */
export interface IngestionTask {
  readonly id: IngestionJobId;
  readonly userId: UserId;
  readonly itemId: ItemId;
}

export class IngestionPipeline extends Context.Service<
  IngestionPipeline,
  { readonly run: (job: IngestionTask) => Effect.Effect<void, IngestionError> }
>()("avenire/ingestion/IngestionPipeline") {}

/** Attribute any failure inside `effect` to the named stage. */
const stage =
  (name: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, IngestionError, R> =>
    Effect.mapError(effect, (cause) => new IngestionError({ stage: name, cause }));

/** Requires `HttpClient` (web extraction) and `Crypto` (chunk ids) at construction. */
export const IngestionPipelineLive = Layer.effect(
  IngestionPipeline,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const embedder = yield* Embedder;
    const services = yield* Effect.context<Database | HttpClient.HttpClient | Crypto.Crypto>();

    const setStatus = (job: IngestionTask, status: IngestionStatus) =>
      database.use((db) =>
        db
          .update(ingestionJob)
          .set({
            status,
            updatedAt: sql`now()`,
            ...(status === "indexed" ? { error: null, lockedUntil: null } : {}),
          })
          .where(and(eq(ingestionJob.id, job.id), eq(ingestionJob.userId, job.userId))),
      );

    const loadItem = (job: IngestionTask) =>
      database
        .use((db) =>
          db.query.item.findFirst({
            where: and(eq(item.id, job.itemId), eq(item.userId, job.userId)),
          }),
        )
        .pipe(
          Effect.filterOrFail(
            (found): found is ItemRow => found !== undefined,
            () => new NotFound({ entity: "Item", id: job.itemId }),
          ),
        );

    const readSource = (found: ItemRow) =>
      found.storageKey === null
        ? Effect.succeed(null)
        : storage.get(StorageKey.make(found.storageKey));

    const chunkRows = (
      job: IngestionTask,
      chunks: ReadonlyArray<Chunk>,
      vectors: ReadonlyArray<ReadonlyArray<number>>,
    ) =>
      Effect.forEach(chunks, (value, index) =>
        Effect.map(newId(ChunkId), (id) => ({
          id,
          userId: job.userId,
          itemId: job.itemId,
          ordinal: value.ordinal,
          kind: value.kind,
          content: value.content,
          location: value.location,
          tokenCount: value.tokenCount,
          embedding: [...(vectors[index] ?? [])],
          embeddingModel: embedder.model,
        })),
      );

    const replaceChunks = (job: IngestionTask, rows: ReadonlyArray<typeof chunk.$inferInsert>) =>
      database.useTransaction(async (tx) => {
        await tx
          .delete(chunk)
          .where(and(eq(chunk.itemId, job.itemId), eq(chunk.userId, job.userId)));
        if (rows.length > 0) await tx.insert(chunk).values([...rows]);
      });

    const run = Effect.fn("IngestionPipeline.run")(function* (job: IngestionTask) {
      const found = yield* loadItem(job).pipe(stage("loading the item"));
      const source = yield* readSource(found).pipe(stage("reading the source"));

      yield* setStatus(job, "extracting").pipe(stage("extracting"));
      const document = yield* extract(found, source).pipe(stage("extracting"));

      yield* setStatus(job, "chunking").pipe(stage("chunking"));
      const chunks = chunkSections(document.sections, { transcript: found.kind === "video" });

      yield* setStatus(job, "embedding").pipe(stage("embedding"));
      const vectors = yield* embedder
        .embedMany(chunks.map((value) => value.content))
        .pipe(stage("embedding"));

      const rows = yield* chunkRows(job, chunks, vectors).pipe(stage("persisting chunks"));
      yield* replaceChunks(job, rows).pipe(stage("persisting chunks"));

      if (vectors.length > 0) {
        yield* setStatus(job, "clustering").pipe(stage("clustering"));
        const title = document.title ?? found.title;
        yield* assignClusters(job.userId, job.itemId, meanVector(vectors), title).pipe(
          stage("clustering"),
        );
      }
      yield* setStatus(job, "indexed").pipe(stage("finishing"));
    });

    return IngestionPipeline.of({
      run: (job) => run(job).pipe(Effect.provideContext(services)),
    });
  }),
);
