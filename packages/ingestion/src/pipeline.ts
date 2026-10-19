/**
 * One ingestion run: load -> extract -> index -> cluster.
 * Each stage is persisted on the job so the inbox can show progress.
 */
import {
  type ExtractionCoverage,
  type IngestionJobId,
  type IngestionStatus,
  type ItemId,
  NotFound,
  StorageKey,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { ingestionJob, item, type ItemRow } from "@avenire/database/schema";
import { Storage } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { markContentChanged } from "./events.ts";
import { assignClusters } from "./cluster.ts";
import { loadDocument, saveDocument } from "./document.ts";
import { extract, type ExtractionServices } from "./extract/index.ts";
import { EXTRACTOR_VERSION } from "./extract/types.ts";
import { ItemIndexer } from "./indexer.ts";
import { sha256Hex } from "./text.ts";

export class IngestionError extends Schema.TaggedError<IngestionError>()("IngestionError", {
  stage: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Ingestion failed while ${this.stage}`;
  }
}

/** The job a pipeline run works on, as claimed from the queue. */
export interface IngestionTask {
  readonly id: IngestionJobId;
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** The job's generation when claimed; writes are ignored once it is superseded. */
  readonly generation: number;
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

/** Requires the extraction services, `Database` and `Crypto` (cluster ids). */
export const IngestionPipelineLive = Layer.effect(
  IngestionPipeline,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const itemIndexer = yield* ItemIndexer;
    const services = yield* Effect.context<
      Database | Storage | Crypto.Crypto | ExtractionServices
    >();

    const setStatus = (job: IngestionTask, status: IngestionStatus) =>
      database.use((db) =>
        db
          .update(ingestionJob)
          .set({
            status,
            updatedAt: sql`now()`,
            ...(status === "indexed" ? { error: null, lockedUntil: null } : {}),
          })
          .where(
            and(
              eq(ingestionJob.id, job.id),
              eq(ingestionJob.userId, job.userId),
              eq(ingestionJob.generation, job.generation),
            ),
          ),
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

    const recordCoverage = (job: IngestionTask, coverage: ExtractionCoverage) =>
      database.use((db) =>
        db
          .update(ingestionJob)
          .set({ coverage, updatedAt: sql`now()` })
          .where(
            and(
              eq(ingestionJob.id, job.id),
              eq(ingestionJob.userId, job.userId),
              eq(ingestionJob.generation, job.generation),
            ),
          ),
      );

    const readSource = (found: ItemRow) =>
      found.storageKey === null
        ? Effect.succeed(null)
        : storage.get(StorageKey.make(found.storageKey));

    /**
     * The stored document when the source bytes and extractor version are unchanged,
     * otherwise a fresh extraction, stored for next time.
     */
    const documentFor = Effect.fn("IngestionPipeline.documentFor")(function* (
      job: IngestionTask,
      found: ItemRow,
      bytes: Uint8Array | null,
    ) {
      const contentHash = bytes === null ? null : sha256Hex(bytes);
      const reusable =
        contentHash !== null &&
        found.contentHash === contentHash &&
        found.extractorVersion === EXTRACTOR_VERSION &&
        found.documentKey !== null;
      if (reusable) {
        const stored = yield* loadDocument(job.userId, job.itemId);
        if (Option.isSome(stored)) return stored.value;
      }
      const document = yield* extract({ ...found, bytes });
      // Only bytes we can hash are worth keeping: URL sources are re-fetched anyway.
      if (contentHash !== null && document.sections.length > 0) {
        const key = yield* saveDocument(job.userId, job.itemId, document);
        if (found.contentHash !== null && found.contentHash !== contentHash) {
          yield* markContentChanged(job.userId, job.itemId, contentHash);
        }
        yield* database.use((db) =>
          db
            .update(item)
            .set({ contentHash, documentKey: key, extractorVersion: EXTRACTOR_VERSION })
            .where(and(eq(item.id, found.id), eq(item.userId, found.userId))),
        );
      }
      return document;
    });

    const run = Effect.fn("IngestionPipeline.run")(function* (job: IngestionTask) {
      const found = yield* loadItem(job).pipe(stage("loading the item"));
      const bytes = yield* readSource(found).pipe(stage("reading the source"));

      yield* setStatus(job, "extracting").pipe(stage("extracting"));
      const document = yield* documentFor(job, found, bytes).pipe(stage("extracting"));
      yield* recordCoverage(job, document.coverage).pipe(stage("extracting"));
      if (document.sections.length === 0) {
        return yield* new IngestionError({
          stage: "extracting",
          cause: "Nothing searchable was extracted",
        });
      }

      yield* setStatus(job, "chunking").pipe(stage("chunking"));
      const title = document.title ?? found.title;
      yield* itemIndexer
        .index(
          {
            userId: job.userId,
            itemId: job.itemId,
            title,
            sections: document.sections,
          },
          (status) => setStatus(job, status),
        )
        .pipe(stage("indexing"));

      yield* setStatus(job, "clustering").pipe(stage("clustering"));
      yield* assignClusters(job.userId, job.itemId, title).pipe(stage("clustering"));
      yield* setStatus(job, "indexed").pipe(stage("finishing"));
    });

    return IngestionPipeline.of({
      run: (job) => run(job).pipe(Effect.provideContext(services)),
    });
  }),
);
