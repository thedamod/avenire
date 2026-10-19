/** The ownership boundary for the application's library, capture receipts. */
import {
  type ApiError,
  CanvasNodeId,
  type CanvasNode,
  CaptureId,
  type CaptureSnapshot,
  Conflict,
  FileEventId,
  FileId,
  FolderId,
  IngestionJobId,
  InternalError,
  LibraryFile,
  NotFound,
  StorageKey,
  type FileKind,
  type FilePlacement,
  type Folder,
  type IngestionJob,
  type SubmitCaptureResult,
  type UserId,
} from "@avenire/contracts";
import { applyPolicy } from "@avenire/desktop/capture-policy";
import { lockCorpus } from "@avenire/database/corpus";
import { isDeepStrictEqual } from "node:util";
import { Database } from "@avenire/database/client";
import {
  canvasNode,
  capture,
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
import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import { createHash } from "node:crypto";
import { toApiError } from "./apiErrors.ts";

export interface LibraryOperations {
  readonly getCanvas: (userId: UserId) => Effect.Effect<readonly CanvasNode[], ApiError>;
  readonly saveCanvas: (
    userId: UserId,
    nodes: readonly CanvasNode[],
  ) => Effect.Effect<void, ApiError>;
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
  readonly createFolder: (userId: UserId, name: string) => Effect.Effect<Folder, ApiError>;
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
  storageKey: row.storageKey === null ? null : StorageKey.make(row.storageKey),
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  captureId: row.captureId === null ? null : CaptureId.make(row.captureId),
  folderIds,
  mediaPositionSec: row.mediaPositionSec,
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

interface CaptureCandidate {
  readonly title: string;
  readonly kind: FileKind;
  readonly dedupeKey: string;
  readonly url: string | null;
  readonly text?: string;
  readonly position?: number;
}
/** Local filesystem paths never become server reads. Native clients must upload their bytes. */
export const captureCandidates = (snapshot: CaptureSnapshot) => {
  const policy = applyPolicy(snapshot);
  const candidates = new Map<string, CaptureCandidate>();
  const skipped = policy.blocked.map((entry) => ({
    title: entry.title,
    reason: entry.category as string,
  }));
  const addUrl = (raw: string, title: string, kind: FileKind, position?: number) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      skipped.push({ title, reason: "Invalid URL" });
      return;
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      skipped.push({ title, reason: "Only public HTTP URLs can be captured" });
      return;
    }
    url.hash = "";
    const normalized = url.toString();
    const dedupeKey = `url:${normalized}`;
    candidates.set(dedupeKey, {
      title: title.trim().slice(0, 500) || url.hostname,
      kind,
      url: normalized,
      dedupeKey,
      ...(position !== undefined && Number.isFinite(position) && position >= 0 ? { position } : {}),
    });
  };
  const addText = (text: string, title: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const dedupeKey = `selection:${createHash("sha256").update(trimmed).digest("hex")}`;
    candidates.set(dedupeKey, {
      title: title.trim().slice(0, 500) || trimmed.slice(0, 80),
      kind: "selection",
      url: null,
      text: trimmed,
      dedupeKey,
    });
  };
  for (const tab of policy.snapshot.tabs) {
    addUrl(tab.finalUrl ?? tab.url, tab.title, tab.likelyPdf ? "pdf" : "web-page");
    if (tab.selectionText) addText(tab.selectionText, `Selection from ${tab.title}`);
  }
  for (const media of policy.snapshot.media) {
    if (media.url) addUrl(media.url, media.title, "video", media.positionSec);
    else
      skipped.push({
        title: media.title,
        reason: "Upload this local media file to capture its contents",
      });
  }
  for (const window of policy.snapshot.windows) {
    if (window.filePath)
      skipped.push({
        title: window.title,
        reason: "Upload this local file to capture its contents",
      });
  }
  if (policy.snapshot.selectionText) addText(policy.snapshot.selectionText, "Captured selection");
  return { snapshot: policy.snapshot, candidates: [...candidates.values()], skipped };
};

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
      return rows.map((row) => fileToContract(row, byFile.get(row.id) ?? []));
    });
    const getFile = Effect.fn("Library.getFile")(function* (userId: UserId, id: FileId) {
      const row = yield* database.use((db) =>
        db.query.file.findFirst({ where: and(eq(file.id, id), eq(file.userId, userId)) }),
      );
      if (!row) return yield* new NotFound({ entity: "File", id });
      return (yield* wireFiles(userId, [row]))[0]!;
    });
    const listFolders = Effect.fn("Library.listFolders")(function* (userId: UserId) {
      const rows = yield* database.use((db) =>
        db
          .select({ folder, fileCount: sql<number>`count(${file.id})::int` })
          .from(folder)
          .leftJoin(
            fileFolder,
            and(eq(fileFolder.folderId, folder.id), eq(fileFolder.userId, userId)),
          )
          .leftJoin(
            file,
            and(
              eq(file.id, fileFolder.fileId),
              eq(file.userId, userId),
              sql`${file.placement} <> 'archived'`,
            ),
          )
          .where(eq(folder.userId, userId))
          .groupBy(folder.id)
          .orderBy(asc(folder.name), asc(folder.id)),
      );
      return rows.map(({ folder: row, fileCount }) => ({
        id: FolderId.make(row.id),
        name: row.name,
        suggested: row.suggested,
        fileCount,
        createdAt: row.createdAt.toISOString(),
      }));
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
      getCanvas: (userId) =>
        database
          .use((db) => db.select().from(canvasNode).where(eq(canvasNode.userId, userId)))
          .pipe(
            Effect.map((rows) =>
              rows.map(({ id, ref, x, y, width, height }) => ({
                id: CanvasNodeId.make(id),
                ref,
                x,
                y,
                width,
                height,
              })),
            ),
            Effect.mapError(toApiError),
          ),
      saveCanvas: (userId, nodes) =>
        Effect.gen(function* () {
          if (nodes.length > 1000 || new Set(nodes.map((node) => node.id)).size !== nodes.length)
            return yield* new Conflict({ reason: "Invalid canvas node collection." });
          const saved = yield* database.useTransaction(async (tx) => {
            // Serialize a user's replacement writes without changing other owners' boards.
            await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
            for (const node of nodes) {
              if (![node.x, node.y, node.width, node.height].every(Number.isFinite)) return false;
              if (node.ref._tag === "file") {
                const [owned] = await tx
                  .select({ id: file.id })
                  .from(file)
                  .where(and(eq(file.id, node.ref.fileId), eq(file.userId, userId)))
                  .for("share");
                if (!owned) return false;
              } else if (node.ref._tag === "folder") {
                const [owned] = await tx
                  .select({ id: folder.id })
                  .from(folder)
                  .where(and(eq(folder.id, node.ref.folderId), eq(folder.userId, userId)))
                  .for("share");
                if (!owned) return false;
              }
            }
            await tx.delete(canvasNode).where(eq(canvasNode.userId, userId));
            if (nodes.length > 0)
              await tx.insert(canvasNode).values(nodes.map((node) => ({ ...node, userId })));
            return true;
          });
          if (!saved)
            return yield* new Conflict({
              reason: "Canvas references must belong to the current user.",
            });
        }).pipe(Effect.mapError(toApiError)),
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
                    ? undefined
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
      createFolder: (userId, name) =>
        Effect.gen(function* () {
          const value = validName(name);
          if (!value)
            return yield* new Conflict({ reason: "Folder names must contain 1–200 characters." });
          const id = yield* makeId(FolderId);
          const [row] = yield* database.use((db) =>
            db.insert(folder).values({ id, userId, name: value }).returning(),
          );
          if (!row) return yield* new InternalError({});
          return {
            id,
            name: row.name,
            suggested: false,
            fileCount: 0,
            createdAt: row.createdAt.toISOString(),
          };
        }).pipe(Effect.mapError(toApiError)),
      renameFolder: (userId, id, name) =>
        Effect.gen(function* () {
          const value = validName(name);
          if (!value)
            return yield* new Conflict({ reason: "Folder names must contain 1–200 characters." });
          const rows = yield* database.use((db) =>
            db
              .update(folder)
              .set({ name: value, suggested: false, updatedAt: sql`now()` })
              .where(and(eq(folder.id, id), eq(folder.userId, userId)))
              .returning({ id: folder.id }),
          );
          if (!rows.length) return yield* new NotFound({ entity: "Folder", id });
          return (yield* listFolders(userId)).find((row) => row.id === id)!;
        }).pipe(Effect.mapError(toApiError)),
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
          const prepared = captureCandidates(snapshot);
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
