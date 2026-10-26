import { defaultNotebookAppearance, markdownPreview } from "@avenire/shared/notebook";
/** The ownership boundary for the application's library, capture receipts. */
import {
  type CreateFolderRequest,
  type UpdateFolderRequest,
  type ApiError,
  CaptureId,
  type CaptureSnapshot,
  Conflict,
  FileEventId,
  FileId,
  FolderId,
  IngestionJobId,
  LibraryFile,
  NotFound,
  StorageKey,
  type FilePlacement,
  type Folder,
  type IngestionJob,
  type SubmitCaptureResult,
  type UserId,
} from "@avenire/contracts";
import { captureCandidates } from "@avenire/capture/candidates";
import { lockCorpus } from "@avenire/database/corpus";
import { isDeepStrictEqual } from "node:util";
import { Database } from "@avenire/database/client";
import {
  capture,
  chunk,
  file,
  fileEvent,
  fileFolder,
  folder,
  ingestionJob,
  user,
} from "@avenire/database/schema";
import { recordFileEvent } from "@avenire/ingestion/events";
import { setFileFolders } from "@avenire/ingestion/folder";
import { enqueueIngestionTx } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { fileSourceKey, newKeyVersion } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, desc, eq, exists, inArray, isNull, isNotNull, ne, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { createHash } from "node:crypto";
import { makeLibraryFeatures, purgeAt, type LibraryFeatures } from "./libraryFeatures.ts";
import { toApiError } from "./apiErrors.ts";

export interface LibraryOperations extends LibraryFeatures {
  readonly getFolder: (userId: UserId, id: FolderId) => Effect.Effect<Folder, ApiError>;
  readonly updateFolder: (
    userId: UserId,
    input: typeof UpdateFolderRequest.Type,
  ) => Effect.Effect<Folder, ApiError>;
  readonly listFiles: (
    userId: UserId,
    filters?: {
      readonly placement?: FilePlacement | undefined;
      readonly folderId?: FolderId | undefined;
    },
  ) => Effect.Effect<readonly LibraryFile[], ApiError>;
  readonly getFile: (userId: UserId, id: FileId) => Effect.Effect<LibraryFile, ApiError>;
  readonly submitCapture: (
    userId: UserId,
    snapshot: CaptureSnapshot,
  ) => Effect.Effect<SubmitCaptureResult, ApiError>;
  readonly placeFile: (
    userId: UserId,
    id: FileId,
    folderIds: readonly FolderId[],
  ) => Effect.Effect<LibraryFile, ApiError>;
  readonly listFolders: (userId: UserId) => Effect.Effect<readonly Folder[], ApiError>;
  readonly createFolder: (
    userId: UserId,
    name: string,
    options?: Omit<typeof CreateFolderRequest.Type, "name">,
  ) => Effect.Effect<Folder, ApiError>;
  readonly renameFolder: (
    userId: UserId,
    id: FolderId,
    name: string,
  ) => Effect.Effect<Folder, ApiError>;
  readonly watchIngestion: (userId: UserId) => Stream.Stream<IngestionJob, ApiError>;
  readonly setIngestionPaused: (
    userId: UserId,
    id: FileId,
    paused: boolean,
  ) => Effect.Effect<IngestionJob, ApiError>;
  readonly recordFileEvent: (userId: UserId, id: FileId) => Effect.Effect<void, ApiError>;
}
export class Library extends Context.Service<Library, LibraryOperations>()("avenire/web/Library") {}

type FileRow = typeof file.$inferSelect;
export const fileToContract = (row: FileRow, folderIds: readonly FolderId[] = []): LibraryFile => ({
  id: FileId.make(row.id),
  kind: row.kind,
  title: row.title,
  placement: row.placement,
  source: row.source,
  tags: row.tags,
  contentModifiedAt: row.contentModifiedAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
  sourceUrl: row.sourceUrl,
  origin: row.origin,
  access: row.access,
  storageKey: row.storageKey === null ? null : StorageKey.make(row.storageKey),
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  captureId: row.captureId === null ? null : CaptureId.make(row.captureId),
  folderIds,
  mediaPositionSec: row.mediaPositionSec,
  preview: row.preview,
  purgeAt: purgeAt(row),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
export const jobToContract = (row: typeof ingestionJob.$inferSelect): IngestionJob => ({
  id: IngestionJobId.make(row.id),
  fileId: FileId.make(row.fileId),
  status: row.status,
  attempts: row.attempts,
  error: row.error,
  coverage: row.coverage,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const validName = (name: string) => {
  const value = name.trim();
  return value.length > 0 && value.length <= 200 ? value : undefined;
};

export const LibraryLive = Layer.effect(
  Library,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const crypto = yield* Crypto.Crypto;
    const makeId = <Id extends string>(schema: { readonly make: (id: string) => Id }) =>
      newId(schema).pipe(Effect.provideService(Crypto.Crypto, crypto));
    const memberships = (userId: UserId, ids: readonly string[]) =>
      database.use((db) =>
        ids.length === 0
          ? Promise.resolve([])
          : db
              .select({ fileId: fileFolder.fileId, folderId: fileFolder.folderId })
              .from(fileFolder)
              .innerJoin(folder, and(eq(folder.id, fileFolder.folderId), eq(folder.userId, userId)))
              .where(and(eq(fileFolder.userId, userId), inArray(fileFolder.fileId, [...ids]))),
      );
    const wireFiles = Effect.fn("Library.wireFiles")(function* (
      userId: UserId,
      rows: readonly FileRow[],
    ) {
      const links = yield* memberships(
        userId,
        rows.map((row) => row.id),
      );
      const byFile = new Map<string, FolderId[]>();
      for (const link of links) {
        const values = byFile.get(link.fileId) ?? [];
        values.push(FolderId.make(link.folderId));
        byFile.set(link.fileId, values);
      }
      const missing = rows
        .filter((row) => row.kind === "note" && row.preview === null && row.storageKey !== null)
        .map((row) => row.id);
      const openings = missing.length
        ? yield* database.use((db) =>
            db
              .selectDistinctOn([chunk.fileId], { fileId: chunk.fileId, content: chunk.content })
              .from(chunk)
              .where(and(eq(chunk.userId, userId), inArray(chunk.fileId, missing)))
              .orderBy(asc(chunk.fileId), asc(chunk.ordinal)),
          )
        : [];
      const previews = new Map(openings.map((row) => [row.fileId, markdownPreview(row.content)]));
      return rows.map((row) =>
        fileToContract(
          { ...row, preview: row.preview ?? previews.get(row.id) ?? null },
          byFile.get(row.id) ?? [],
        ),
      );
    });
    const getFile = Effect.fn("Library.getFile")(function* (userId: UserId, id: FileId) {
      const row = yield* database.use((db) =>
        db.query.file.findFirst({ where: and(eq(file.id, id), eq(file.userId, userId)) }),
      );
      if (!row) return yield* new NotFound({ entity: "File", id });
      return (yield* wireFiles(userId, [row]))[0]!;
    });
    const listFolders = Effect.fn("Library.listFolders")(function* (
      userId: UserId,
      archived = false,
    ) {
      const rows = yield* database.use((db) =>
        db
          .select()
          .from(folder)
          .where(
            and(
              eq(folder.userId, userId),
              archived ? isNotNull(folder.archivedAt) : isNull(folder.archivedAt),
            ),
          )
          .orderBy(asc(folder.name), asc(folder.id)),
      );
      const members = yield* database.use((db) =>
        db
          .select({ folderId: fileFolder.folderId, kind: file.kind, updatedAt: file.updatedAt })
          .from(fileFolder)
          .innerJoin(
            file,
            and(
              eq(file.id, fileFolder.fileId),
              eq(file.userId, userId),
              ne(file.placement, "archived"),
            ),
          )
          .where(eq(fileFolder.userId, userId)),
      );
      return rows.map((row) => {
        const files = members.filter((f) => f.folderId === row.id);
        const noteCount = files.filter((f) => f.kind === "note").length;
        return {
          id: FolderId.make(row.id),
          name: row.name,
          suggested: row.suggested,
          color: row.color,
          cover: row.cover,
          archivedAt: row.archivedAt?.toISOString() ?? null,
          fileCount: files.length,
          noteCount,
          sourceCount: files.length - noteCount,
          createdAt: row.createdAt.toISOString(),
          updatedAt: new Date(
            Math.max(row.updatedAt.getTime(), ...files.map((f) => f.updatedAt.getTime())),
          ).toISOString(),
        };
      });
    });
    const getFolder = Effect.fn(function* (userId: UserId, id: FolderId) {
      const row = (yield* listFolders(userId)).find((f) => f.id === id);
      if (!row) return yield* new NotFound({ entity: "Folder", id });
      return row;
    });
    const updateFolder = Effect.fn(function* (
      userId: UserId,
      input: typeof UpdateFolderRequest.Type,
    ) {
      yield* getFolder(userId, input.folderId);
      const { folderId, ...patch } = input;
      if (patch.name !== undefined && !validName(patch.name))
        return yield* new Conflict({ reason: "Invalid folder name." });
      yield* database.use((db) =>
        db
          .update(folder)
          .set({
            ...patch,
            ...(patch.name === undefined ? {} : { name: patch.name.trim(), suggested: false }),
            updatedAt: new Date(),
          })
          .where(
            and(eq(folder.id, folderId), eq(folder.userId, userId), isNull(folder.archivedAt)),
          ),
      );
      return yield* getFolder(userId, folderId);
    });
    const readJob = Effect.fn("Library.readJob")(function* (userId: UserId, id: FileId) {
      const [row] = yield* database.use((db) =>
        db
          .select({ job: ingestionJob })
          .from(ingestionJob)
          .innerJoin(file, and(eq(file.id, ingestionJob.fileId), eq(file.userId, userId)))
          .where(and(eq(ingestionJob.userId, userId), eq(ingestionJob.fileId, id)))
          .limit(1),
      );
      if (!row) return yield* new NotFound({ entity: "IngestionJob", id });
      return jobToContract(row.job);
    });
    return Library.of({
      ...makeLibraryFeatures(database, storage, crypto, getFile, listFolders, wireFiles),
      getFolder: (userId, id) => getFolder(userId, id).pipe(Effect.mapError(toApiError)),
      updateFolder: (userId, input) =>
        updateFolder(userId, input).pipe(Effect.mapError(toApiError)),
      getFile: (userId, id) => getFile(userId, id).pipe(Effect.mapError(toApiError)),
      listFiles: (userId, filters = {}) =>
        Effect.gen(function* () {
          const rows = yield* database.use((db) =>
            db
              .select()
              .from(file)
              .where(
                and(
                  eq(file.userId, userId),
                  filters.placement === undefined
                    ? ne(file.placement, "archived")
                    : eq(file.placement, filters.placement),
                  filters.folderId === undefined
                    ? undefined
                    : exists(
                        db
                          .select({ id: fileFolder.fileId })
                          .from(fileFolder)
                          .innerJoin(
                            folder,
                            and(eq(folder.id, fileFolder.folderId), eq(folder.userId, userId)),
                          )
                          .where(
                            and(
                              eq(fileFolder.userId, userId),
                              eq(fileFolder.fileId, file.id),
                              eq(fileFolder.folderId, filters.folderId),
                            ),
                          ),
                      ),
                ),
              )
              .orderBy(desc(file.createdAt), desc(file.id)),
          );
          return yield* wireFiles(userId, rows);
        }).pipe(Effect.mapError(toApiError)),
      recordFileEvent: (userId, id) =>
        recordFileEvent(userId, id, "opened").pipe(
          Effect.provideService(Database, database),
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.mapError(toApiError),
        ),
      placeFile: (userId, id, folderIds) =>
        Effect.gen(function* () {
          if (folderIds.length > 100)
            return yield* new Conflict({ reason: "A file can belong to at most 100 folders." });
          yield* setFileFolders(userId, id, folderIds).pipe(
            Effect.provideService(Database, database),
          );
          return yield* getFile(userId, id);
        }).pipe(Effect.mapError(toApiError)),
      listFolders: (userId) => listFolders(userId).pipe(Effect.mapError(toApiError)),
      createFolder: (userId, name, options = {}) =>
        Effect.gen(function* () {
          const value = validName(name);
          if (!value)
            return yield* new Conflict({ reason: "Folder names must contain 1–200 characters." });
          const id = yield* makeId(FolderId);
          const appearance = defaultNotebookAppearance(value);
          yield* database.use((db) =>
            db.insert(folder).values({
              id,
              userId,
              name: value,
              color: options.color ?? appearance.color,
              cover: options.cover ?? appearance.cover,
            }),
          );
          return yield* getFolder(userId, id);
        }).pipe(Effect.mapError(toApiError)),
      renameFolder: (userId, folderId, name) =>
        updateFolder(userId, { folderId, name }).pipe(Effect.mapError(toApiError)),
      setIngestionPaused: (userId, id, paused) =>
        Effect.gen(function* () {
          const jobId = yield* makeId(IngestionJobId);
          const found = yield* database.useTransaction(async (tx) => {
            await lockCorpus(tx, userId);
            const [owned] = await tx
              .select({ id: file.id })
              .from(file)
              .where(
                and(eq(file.id, id), eq(file.userId, userId), sql`${file.placement} <> 'archived'`),
              )
              .for("update");
            if (!owned) return false;
            if (!paused) {
              await enqueueIngestionTx(tx, userId, id, jobId);
              return true;
            }
            await tx
              .insert(ingestionJob)
              .values({ id: jobId, userId, fileId: id, status: "paused" })
              .onConflictDoUpdate({
                target: ingestionJob.fileId,
                set: {
                  status: "paused",
                  generation: sql`${ingestionJob.generation} + 1`,
                  updatedAt: sql`now()`,
                },
              });
            return true;
          });
          if (!found) return yield* new NotFound({ entity: "File", id });
          return yield* readJob(userId, id);
        }).pipe(Effect.mapError(toApiError)),
      watchIngestion: (userId) =>
        Stream.suspend(() => {
          const seen = new Map<string, string>();
          return Stream.fromEffectSchedule(
            database
              .use((db) =>
                db
                  .select({ job: ingestionJob })
                  .from(ingestionJob)
                  .innerJoin(file, and(eq(file.id, ingestionJob.fileId), eq(file.userId, userId)))
                  .where(eq(ingestionJob.userId, userId))
                  .orderBy(asc(ingestionJob.updatedAt), asc(ingestionJob.id)),
              )
              .pipe(Effect.mapError(toApiError)),
            Schedule.spaced("2 seconds"),
          ).pipe(
            Stream.flatMap((rows) => {
              const active = new Set(rows.map(({ job }) => job.id));
              for (const id of seen.keys()) if (!active.has(id)) seen.delete(id);
              return Stream.fromIterable(
                rows.flatMap(({ job }) => {
                  const version = `${job.updatedAt.toISOString()}:${job.status}:${job.generation}`;
                  if (seen.get(job.id) === version) return [];
                  seen.set(job.id, version);
                  return [jobToContract(job)];
                }),
              );
            }),
          );
        }),
      submitCapture: (userId, snapshot) =>
        Effect.gen(function* () {
          if (
            snapshot.tabs.length + snapshot.windows.length + snapshot.media.length > 200 ||
            !Number.isFinite(Date.parse(snapshot.capturedAt)) ||
            Buffer.byteLength(JSON.stringify(snapshot)) > 2 * 1024 * 1024
          )
            return yield* new Conflict({
              reason: "Capture must contain a valid timestamp and at most 200 sources.",
            });
          const prepared = captureCandidates(snapshot, (text) =>
            createHash("sha256").update(text).digest("hex"),
          );
          const entries = yield* Effect.forEach(prepared.candidates, (candidate) =>
            Effect.gen(function* () {
              const id = yield* makeId(FileId);
              const eventId = yield* makeId(FileEventId);
              const jobId = yield* makeId(IngestionJobId);
              const key =
                candidate.text === undefined
                  ? null
                  : fileSourceKey(
                      userId,
                      id,
                      "selection.txt",
                      yield* newKeyVersion.pipe(Effect.provideService(Crypto.Crypto, crypto)),
                    );
              return { candidate, id, eventId, jobId, key };
            }),
          );
          const written: StorageKey[] = [];
          let retained: readonly StorageKey[] = [];
          const cleanup = (keys: readonly StorageKey[]) =>
            Effect.forEach(
              keys,
              (key) =>
                storage
                  .remove(key)
                  .pipe(
                    Effect.catchTag("StorageError", (error) =>
                      Effect.logError("Capture object cleanup failed", { key, error }),
                    ),
                  ),
              { discard: true },
            );
          return yield* Effect.gen(function* () {
            for (const entry of entries)
              if (entry.key && entry.candidate.text !== undefined) {
                yield* storage.put(entry.key, entry.candidate.text, {
                  contentType: "text/plain; charset=utf-8",
                });
                written.push(entry.key);
              }
            const result = yield* database
              .useTransaction(async (tx) => {
                await tx
                  .select({ id: user.id })
                  .from(user)
                  .where(eq(user.id, userId))
                  .for("no key update");
                await tx
                  .insert(capture)
                  .values({
                    id: snapshot.id,
                    userId,
                    deviceId: snapshot.deviceId,
                    capturedAt: new Date(snapshot.capturedAt),
                    snapshot: prepared.snapshot,
                  })
                  .onConflictDoNothing();
                const [receipt] = await tx
                  .select({ userId: capture.userId, snapshot: capture.snapshot })
                  .from(capture)
                  .where(eq(capture.id, snapshot.id));
                if (
                  !receipt ||
                  receipt.userId !== userId ||
                  !isDeepStrictEqual(receipt.snapshot, prepared.snapshot)
                )
                  return undefined;
                const rows: FileRow[] = [];
                const kept: StorageKey[] = [];
                for (const entry of entries) {
                  const { candidate, id, key } = entry;
                  const [existing] = await tx
                    .select()
                    .from(file)
                    .where(and(eq(file.userId, userId), eq(file.dedupeKey, candidate.dedupeKey)))
                    .limit(1);
                  if (existing) {
                    rows.push(existing);
                    continue;
                  }
                  const [inserted] = await tx
                    .insert(file)
                    .values({
                      id,
                      userId,
                      title: candidate.title,
                      kind: candidate.kind,
                      source: "capture",
                      captureId: snapshot.id,
                      dedupeKey: candidate.dedupeKey,
                      sourceUrl: candidate.url,
                      storageKey: key,
                      mimeType: candidate.text === undefined ? null : "text/plain",
                      sizeBytes:
                        candidate.text === undefined ? null : Buffer.byteLength(candidate.text),
                      mediaPositionSec: candidate.position ?? null,
                    })
                    .returning();
                  if (!inserted) continue;
                  if (key) kept.push(key);
                  await tx
                    .insert(fileEvent)
                    .values({ id: entry.eventId, userId, fileId: id, kind: "captured" });
                  await enqueueIngestionTx(tx, userId, id, entry.jobId);
                  rows.push(inserted);
                }
                return { rows, kept };
              })
              .pipe(
                Effect.tap((result) =>
                  Effect.sync(() => {
                    retained = result?.kept ?? [];
                  }),
                ),
                Effect.uninterruptible,
              );
            if (!result)
              return yield* new Conflict({ reason: "Capture identifier was already used." });
            yield* cleanup(written.filter((key) => !result.kept.includes(key)));
            return { files: yield* wireFiles(userId, result.rows), skipped: prepared.skipped };
          }).pipe(Effect.onError(() => cleanup(written.filter((key) => !retained.includes(key)))));
        }).pipe(Effect.mapError(toApiError)),
    });
  }),
);
