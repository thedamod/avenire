/**
 * One ingestion run: load -> extract -> chunk -> embed -> persist -> cluster.
 * Each stage is persisted on the job so the inbox can show progress, and chunk
 * writes replace the item's previous chunks so re-ingestion is idempotent.
 */
import { ChunkId, type IngestionStatus, type ItemId, type StorageKey, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, type IngestionJobRow, ingestionJob, item } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { Storage } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { chunkSections } from "./chunk.ts";
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

export class IngestionPipeline extends Context.Service<
  IngestionPipeline,
  {
    readonly run: (
      job: IngestionJobRow,
    ) => Effect.Effect<void, IngestionError, HttpClient.HttpClient | Crypto.Crypto>;
  }
>()("avenire/ingestion/IngestionPipeline") {}

/** Attribute any failure inside `effect` to the named stage. */
const stage =
  (name: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, IngestionError, R> =>
    Effect.mapError(effect, (cause) => new IngestionError({ stage: name, cause }));

export const IngestionPipelineLive = Layer.effect(
  IngestionPipeline,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const embedder = yield* Embedder;

    const setStatus = (job: IngestionJobRow, status: IngestionStatus) =>
      database.use((db) =>
        db
          .update(ingestionJob)
          .set({ status, updatedAt: sql`now()`, ...(status === "indexed" ? { error: null, lockedUntil: null } : {}) })
          .where(and(eq(ingestionJob.id, job.id), eq(ingestionJob.userId, job.userId))),
      );

    const loadItem = (job: IngestionJobRow) =>
      database
        .use((db) =>
          db.query.item.findFirst({ where: and(eq(item.id, job.itemId), eq(item.userId, job.userId)) }),
        )
        .pipe(
          Effect.flatMap((found) =>
            found === undefined ? Effect.fail(new Error(`Item ${job.itemId} no longer exists`)) : Effect.succeed(found),
          ),
        );

    const run = Effect.fn("IngestionPipeline.run")(function* (job: IngestionJobRow) {
      const userId = job.userId as UserId;
      const itemId = job.itemId as ItemId;

      const found = yield* loadItem(job).pipe(stage("loading the item"));
      const source =
        found.storageKey === null
          ? null
          : yield* storage.get(found.storageKey as StorageKey).pipe(stage("reading the source"));

      yield* setStatus(job, "extracting").pipe(stage("extracting"));
      const document = yield* extract(found, source).pipe(stage("extracting"));

      yield* setStatus(job, "chunking").pipe(stage("chunking"));
      const chunks = chunkSections(document.sections, { transcript: found.kind === "video" });

      yield* setStatus(job, "embedding").pipe(stage("embedding"));
      const vectors = yield* embedder.embedMany(chunks.map((value) => value.content)).pipe(stage("embedding"));

      const rows = yield* Effect.forEach(chunks, (value, index) =>
        Effect.map(newId(ChunkId), (id) => ({
          id,
          userId,
          itemId,
          ordinal: value.ordinal,
          kind: value.kind,
          content: value.content,
          location: value.location,
          tokenCount: value.tokenCount,
          embedding: [...(vectors[index] ?? [])],
          embeddingModel: embedder.model,
        })),
      ).pipe(stage("persisting chunks"));
      yield* database
        .useTransaction(async (tx) => {
          await tx.delete(chunk).where(and(eq(chunk.itemId, itemId), eq(chunk.userId, userId)));
          if (rows.length > 0) await tx.insert(chunk).values(rows);
        })
        .pipe(stage("persisting chunks"));

      if (vectors.length > 0) {
        yield* setStatus(job, "clustering").pipe(stage("clustering"));
        yield* assignClusters(userId, itemId, meanVector(vectors), document.title ?? found.title).pipe(
          Effect.provideService(Database, database),
          stage("clustering"),
        );
      }
      yield* setStatus(job, "indexed").pipe(stage("finishing"));
    });

    return IngestionPipeline.of({ run });
  }),
);
