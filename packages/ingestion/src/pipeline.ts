/**
 * One ingestion run: load -> extract -> index -> folder.
 * Each stage is persisted on the job so the inbox can show progress.
 */
import {
  type ExtractionCoverage,
  type IngestionStatus,
  NotFound,
  StorageKey,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { ingestionJob, file, sourceUpload, type FileRow } from "@avenire/database/schema";
import { Storage } from "@avenire/storage/storage";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import {
  loadDocument,
  mergeExtractionRetry,
  removeDocument,
  reusableDocumentKey,
  saveDocument,
  shouldRetryDocument,
  extractionRetryMinutes,
  type StoredDocument,
} from "./document.ts";
import { extract, type ExtractionServices } from "./extract/index.ts";
import { EXTRACTOR_VERSION, SourceAccessError, UnsupportedSource } from "./extract/types.ts";
import { FileIndexer } from "./indexer.ts";
import { claimPredicate, type IngestionClaim, IngestionLeaseLost } from "./claim.ts";
import { readFile } from "node:fs/promises";
import { sniff } from "./extract/resolve.ts";
import { spoolMediaSource } from "./source.ts";
import { MEDIA_LIMITS } from "./extract/media.ts";
import { sha256Hex } from "./text.ts";

export class IngestionError extends Schema.TaggedError<IngestionError>()("IngestionError", {
  stage: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const instruction =
      this.cause instanceof UnsupportedSource
        ? `: ${this.cause.reason}`
        : typeof this.cause === "string"
          ? `: ${this.cause}`
          : "";
    return `Ingestion failed while ${this.stage}${instruction}`;
  }
}

/** The job a pipeline run works on, as claimed from the queue. */
export interface IngestionTask extends IngestionClaim {
  readonly attempts: number;
  readonly background?: boolean | undefined;
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

/** Requires the extraction services, `Database` and `Crypto` (folder ids). */
export const IngestionPipelineLive = Layer.effect(
  IngestionPipeline,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const fileIndexer = yield* FileIndexer;
    const services = yield* Effect.context<
      Database | Storage | Crypto.Crypto | ExtractionServices
    >();

    const updateJob = (job: IngestionTask, changes: Partial<typeof ingestionJob.$inferInsert>) =>
      database
        .use((db) =>
          db
            .update(ingestionJob)
            .set({ ...changes, updatedAt: sql`now()` })
            .where(claimPredicate(job))
            .returning({ id: ingestionJob.id }),
        )
        .pipe(
          Effect.flatMap((rows) =>
            rows.length ? Effect.void : Effect.fail(new IngestionLeaseLost({ fileId: job.fileId })),
          ),
        );
    const setStatus = (job: IngestionTask, status: IngestionStatus) =>
      job.background
        ? Effect.void
        : updateJob(job, {
            status,
            ...(status === "indexed" ? { error: null, lockedUntil: null, claimToken: null } : {}),
          });
    const loadFile = (job: IngestionTask) =>
      database
        .use((db) =>
          db.query.file.findFirst({
            where: and(
              eq(file.id, job.fileId),
              eq(file.userId, job.userId),
              isNull(file.archivedAt),
              ne(file.placement, "archived"),
              isNull(file.purgeStartedAt),
            ),
          }),
        )
        .pipe(
          Effect.filterOrFail(
            (found): found is FileRow => found !== undefined,
            () => new NotFound({ entity: "File", id: job.fileId }),
          ),
        );
    const recordCoverage = (job: IngestionTask, coverage: ExtractionCoverage) =>
      updateJob(job, { coverage });

    const readSource = (found: FileRow) =>
      found.storageKey === null
        ? Effect.succeed(null)
        : storage.get(StorageKey.make(found.storageKey));

    /**
     * The stored document when the source bytes and extractor version are unchanged,
     * otherwise a fresh extraction, stored for next time.
     */
    const documentFor = Effect.fn("IngestionPipeline.documentFor")(function* (
      job: IngestionTask,
      found: FileRow,
      bytes: Uint8Array | null,
      cached?: StoredDocument,
      local?: { source: { path: string; directory: string; sizeBytes: number }; sha256: string },
    ) {
      if (cached) return { document: cached, publication: undefined };
      const contentHash = local?.sha256 ?? (bytes === null ? null : sha256Hex(bytes));
      const storedKey = reusableDocumentKey(found, contentHash);
      const stored =
        storedKey === null ? Option.none<StoredDocument>() : yield* loadDocument(storedKey);
      if (Option.isSome(stored) && !shouldRetryDocument(stored.value)) {
        return { document: stored.value, publication: undefined };
      }
      const fresh = yield* extract({
        ...found,
        enrichment: job.background ? "full" : "deferred",
        acquisitionMode: found.storageKey === null ? "public-url" : "stored",
        bytes,
        ...(local ? { localMedia: local.source } : {}),
        transcriptScope: { userId: job.userId, fileId: job.fileId },
      });
      const document: StoredDocument = Option.isSome(stored)
        ? {
            ...mergeExtractionRetry(stored.value, fresh),
            retryCount: (stored.value.retryCount ?? 0) + 1,
          }
        : { ...fresh, retryCount: 0 };
      // Extraction is staged in immutable object storage. The pointer is published with chunks/graph.
      if (contentHash === null || document.sections.length === 0)
        return { document, publication: undefined };
      const key = yield* saveDocument(job.userId, job.fileId, document);
      return {
        document,
        publication: {
          key,
          contentHash,
          extractorVersion: EXTRACTOR_VERSION,
          contentChanged: found.contentHash !== null && found.contentHash !== contentHash,
        },
      };
    });

    const run = Effect.fn("IngestionPipeline.run")(function* (job: IngestionTask) {
      const found = yield* loadFile(job).pipe(stage("loading the file"));
      // A completed upload binds the verified digest to these immutable source bytes.
      const [verified] =
        found.storageKey === null
          ? []
          : yield* database
              .use((db) =>
                db
                  .select({ sha256: sourceUpload.sha256 })
                  .from(sourceUpload)
                  .where(
                    and(
                      eq(sourceUpload.userId, job.userId),
                      eq(sourceUpload.completedFileId, found.id),
                      eq(sourceUpload.storageKey, found.storageKey!),
                      eq(sourceUpload.status, "completed"),
                    ),
                  )
                  .limit(1),
              )
              .pipe(stage("checking source identity"));
      const cachedKey = verified ? reusableDocumentKey(found, verified.sha256) : null;
      const cached = cachedKey
        ? yield* loadDocument(cachedKey).pipe(stage("reading extracted content"))
        : Option.none<StoredDocument>();
      const reusable =
        Option.isSome(cached) && !shouldRetryDocument(cached.value) ? cached.value : undefined;
      let local =
        !reusable && found.storageKey && (found.kind === "video" || found.kind === "audio")
          ? yield* storage.stream(StorageKey.make(found.storageKey)).pipe(
              Effect.flatMap((stream) =>
                spoolMediaSource(stream, MEDIA_LIMITS.sourceBytes, verified?.sha256),
              ),
              stage("reading the source"),
            )
          : undefined;
      let bytes =
        reusable || local ? null : yield* readSource(found).pipe(stage("reading the source"));

      if (local && sniff(local.prefix) !== undefined && sniff(local.prefix) !== "media") {
        // Signatures still win over a mislabeled MIME, as they do for buffered sources.
        bytes = yield* Effect.tryPromise(() => readFile(local!.source.path)).pipe(
          stage("reading the source"),
        );
        local = undefined;
      }

      yield* setStatus(job, "extracting").pipe(stage("extracting"));
      const { document, publication } = yield* documentFor(job, found, bytes, reusable, local).pipe(
        stage("extracting"),
      );
      yield* recordCoverage(job, document.coverage).pipe(stage("extracting"));

      if (document.sections.length === 0) {
        return yield* new IngestionError({
          stage: "extracting",
          cause:
            document.access !== undefined && document.access !== "open"
              ? new SourceAccessError({
                  access: document.access,
                  cause: "No searchable content behind the access wall.",
                })
              : [
                  "Nothing searchable was extracted",
                  ...document.coverage.parts.flatMap((part) => (part.detail ? [part.detail] : [])),
                ].join(". "),
        });
      }

      const index = Effect.gen(function* () {
        yield* setStatus(job, "chunking").pipe(stage("chunking"));
        // Library metadata is authoritative even when the source extraction is reused.
        const title = found.title;
        yield* fileIndexer
          .index(
            {
              userId: job.userId,
              fileId: job.fileId,
              title,
              deferGraph: !job.background,
              sections: document.sections,
              claim: job,
              source: found,
              ...(document.access === undefined ? {} : { access: document.access }),
              retryAfterMinutes: extractionRetryMinutes({
                ...document,
                retryCount: Math.max(document.retryCount ?? 0, job.attempts - 1),
              }),
              ...(publication === undefined ? {} : { document: publication }),
            },
            (status) => setStatus(job, status),
          )
          .pipe(stage("indexing"));
      });
      // A superseded or purged run cannot leave a newly staged private object behind.
      // Query the canonical pointer first: ambiguous commit errors must not delete a published object.
      yield* index.pipe(
        Effect.ensuring(
          Effect.gen(function* () {
            if (publication === undefined) return;
            const current = yield* database.use((db) =>
              db.query.file.findFirst({
                columns: { documentKey: true },
                where: and(eq(file.id, job.fileId), eq(file.userId, job.userId)),
              }),
            );
            if (current?.documentKey !== publication.key) yield* removeDocument(publication.key);
            else if (found.documentKey !== null && found.documentKey !== publication.key)
              yield* removeDocument(StorageKey.make(found.documentKey));
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Could not clean staged document", cause),
            ),
          ),
        ),
      );
    });

    return IngestionPipeline.of({
      run: (job) => Effect.scoped(run(job)).pipe(Effect.provideContext(services)),
    });
  }),
);
