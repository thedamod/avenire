import { markdownPreview as notePreview } from "@avenire/shared/notebook";
/** Note writes and reversible trash share the library's corpus publication lock. */
import {
  Conflict,
  FileEventId,
  FileId,
  FolderId,
  IngestionJobId,
  NotFound,
  StorageKey,
  type ApiError,
  type CreateNoteRequest,
  type SaveNoteRequest,
  type NoteContent,
  type FileContentUrl,
  type LibraryFile,
  type TrashEntry,
  type TrashRef,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  advanceCorpusRevision,
  lockCorpus,
  refreshFolderCentroidsTx,
} from "@avenire/database/corpus";
import { file, folder, fileFolder, fileEvent, transcriptCache } from "@avenire/database/schema";
import { enqueueIngestionTx, renameFile } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { fileSourceKey, newKeyVersion } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, eq, inArray, isNull, isNotNull, ne } from "drizzle-orm";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import { toApiError } from "./apiErrors.ts";
import type { Folder } from "@avenire/contracts";

export const purgeAt = (row: { archivedAt: Date | null; purgeRequestedAt: Date | null }) =>
  row.archivedAt === null
    ? null
    : new Date(
        Math.min(
          row.archivedAt.getTime() + 30 * 86400_000,
          row.purgeRequestedAt?.getTime() ?? Infinity,
        ),
      ).toISOString();
export { markdownPreview as notePreview } from "@avenire/shared/notebook";
export interface LibraryFeatures {
  readonly renameFile: (
    userId: UserId,
    id: FileId,
    title: string,
  ) => Effect.Effect<LibraryFile, ApiError>;
  readonly getFileContentUrl: (
    userId: UserId,
    id: FileId,
  ) => Effect.Effect<FileContentUrl, ApiError>;
  readonly createNote: (
    userId: UserId,
    input: typeof CreateNoteRequest.Type,
  ) => Effect.Effect<LibraryFile, ApiError>;
  readonly getNote: (userId: UserId, id: FileId) => Effect.Effect<NoteContent, ApiError>;
  readonly saveNote: (
    userId: UserId,
    input: typeof SaveNoteRequest.Type,
  ) => Effect.Effect<NoteContent, ApiError>;
  readonly trashFiles: (userId: UserId, ids: readonly FileId[]) => Effect.Effect<void, ApiError>;
  readonly trashFolder: (userId: UserId, id: FolderId) => Effect.Effect<void, ApiError>;
  readonly listTrash: (userId: UserId) => Effect.Effect<readonly TrashEntry[], ApiError>;
  readonly restore: (userId: UserId, refs: readonly TrashRef[]) => Effect.Effect<void, ApiError>;
  readonly purge: (userId: UserId, refs: readonly TrashRef[]) => Effect.Effect<void, ApiError>;
  readonly emptyTrash: (userId: UserId) => Effect.Effect<void, ApiError>;
}
export const makeLibraryFeatures = (
  database: Database["Service"],
  storage: Storage["Service"],
  crypto: Crypto.Crypto,
  getFile: (userId: UserId, id: FileId) => Effect.Effect<LibraryFile, unknown>,
  folders: (userId: UserId, archived?: boolean) => Effect.Effect<Folder[], unknown>,
  wireFiles: (
    userId: UserId,
    rows: (typeof file.$inferSelect)[],
  ) => Effect.Effect<LibraryFile[], unknown>,
): LibraryFeatures => {
  const provide = <A, E>(effect: Effect.Effect<A, E, Database | Crypto.Crypto>) =>
    effect.pipe(
      Effect.provideService(Database, database),
      Effect.provideService(Crypto.Crypto, crypto),
      Effect.mapError(toApiError),
    );
  const id = <Id extends string>(schema: { make: (s: string) => Id }) =>
    newId(schema).pipe(Effect.provideService(Crypto.Crypto, crypto));
  const cleanup = (key: StorageKey) =>
    storage
      .remove(key)
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Note object cleanup failed", { key, cause }),
        ),
      );
  // A failed COMMIT response can be ambiguous: never remove the published source.
  const cleanupStaged = (userId: UserId, fileId: FileId, key: StorageKey) =>
    Effect.gen(function* () {
      const [current] = yield* database.use((db) =>
        db
          .select({ storageKey: file.storageKey })
          .from(file)
          .where(and(eq(file.id, fileId), eq(file.userId, userId))),
      );
      if (current?.storageKey !== key) yield* cleanup(key);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Retaining staged note after uncertain publication", { key, cause }),
      ),
    );
  const noteRow = Effect.fn(function* (userId: UserId, fileId: FileId) {
    const [row] = yield* database.use((db) =>
      db
        .select()
        .from(file)
        .where(
          and(
            eq(file.id, fileId),
            eq(file.userId, userId),
            eq(file.kind, "note"),
            ne(file.placement, "archived"),
            isNull(file.purgeStartedAt),
          ),
        ),
    );
    if (!row || !row.storageKey) return yield* new NotFound({ entity: "Note", id: fileId });
    return row;
  });
  const revision = (row: typeof file.$inferSelect) =>
    row.noteRevision ?? row.updatedAt.toISOString();
  const trash = (userId: UserId, refs: readonly TrashRef[], mode: "trash" | "restore" | "purge") =>
    Effect.gen(function* () {
      const result = yield* database.useTransaction(async (tx) => {
        await lockCorpus(tx, userId);
        // Load only the rows these refs can touch: the files named, the files in or swept with
        // the folders named, their memberships, and the folders those memberships point at.
        const refFolderIds = refs.filter((ref) => ref._tag === "folder").map((ref) => ref.id);
        const memberIds = refFolderIds.length
          ? (
              await tx
                .select({ fileId: fileFolder.fileId })
                .from(fileFolder)
                .where(
                  and(eq(fileFolder.userId, userId), inArray(fileFolder.folderId, refFolderIds)),
                )
            ).map((row) => row.fileId)
          : [];
        const sweptIds = refFolderIds.length
          ? (
              await tx
                .select({ id: file.id })
                .from(file)
                .where(
                  and(eq(file.userId, userId), inArray(file.archivedViaFolderId, refFolderIds)),
                )
            ).map((row) => row.id)
          : [];
        const fileIds = [
          ...new Set([
            ...refs.filter((ref) => ref._tag === "file").map((ref) => ref.id as string),
            ...memberIds,
            ...sweptIds,
          ]),
        ];
        const ownedFiles = fileIds.length
          ? await tx
              .select()
              .from(file)
              .where(and(eq(file.userId, userId), inArray(file.id, fileIds)))
          : [];
        const links = fileIds.length
          ? await tx
              .select()
              .from(fileFolder)
              .where(and(eq(fileFolder.userId, userId), inArray(fileFolder.fileId, fileIds)))
          : [];
        const folderIds = [
          ...new Set([
            ...refFolderIds,
            ...links.map((link) => link.folderId),
            ...ownedFiles.flatMap((row) =>
              row.archivedViaFolderId ? [row.archivedViaFolderId] : [],
            ),
          ]),
        ];
        const ownedFolders = folderIds.length
          ? await tx
              .select()
              .from(folder)
              .where(and(eq(folder.userId, userId), inArray(folder.id, folderIds)))
          : [];
        for (const ref of refs) {
          const row =
            ref._tag === "file"
              ? ownedFiles.find((x) => x.id === ref.id)
              : ownedFolders.find((x) => x.id === ref.id);
          if (!row) return { missing: ref };
          if (
            mode !== "purge" &&
            (row.purgeStartedAt ||
              (ref._tag === "file" &&
                ownedFolders.some(
                  (f) =>
                    f.id === ownedFiles.find((x) => x.id === ref.id)?.archivedViaFolderId &&
                    f.purgeStartedAt,
                )) ||
              (ref._tag === "folder" &&
                ownedFiles.some((x) => x.archivedViaFolderId === ref.id && x.purgeStartedAt)))
          )
            return { conflict: true };
          if (mode !== "trash" && !row.archivedAt) return { conflict: true };
        }
        const now = new Date();
        const affected = new Set<string>();
        if (mode === "restore")
          for (const ref of refs)
            if (ref._tag === "folder") {
              await tx
                .update(folder)
                .set({ archivedAt: null, purgeRequestedAt: null, updatedAt: now })
                .where(and(eq(folder.userId, userId), eq(folder.id, ref.id)));
              const local = ownedFolders.find((x) => x.id === ref.id)!;
              local.archivedAt = null;
            }
        if (mode === "trash")
          for (const ref of refs)
            if (ref._tag === "folder") {
              await tx
                .update(folder)
                .set({ archivedAt: now, updatedAt: now })
                .where(
                  and(eq(folder.userId, userId), eq(folder.id, ref.id), isNull(folder.archivedAt)),
                );
              ownedFolders.find((x) => x.id === ref.id)!.archivedAt ??= now;
            }
        for (const ref of refs) {
          if (ref._tag === "file") affected.add(ref.id);
          else {
            if (mode === "purge")
              await tx
                .update(folder)
                .set({ purgeRequestedAt: now, updatedAt: now })
                .where(and(eq(folder.userId, userId), eq(folder.id, ref.id)));
            for (const row of ownedFiles) {
              const active = links.filter(
                (l) =>
                  l.fileId === row.id &&
                  ownedFolders.some((f) => f.id === l.folderId && !f.archivedAt),
              );
              if (
                (mode === "trash" &&
                  !row.archivedAt &&
                  links.some((l) => l.fileId === row.id && l.folderId === ref.id) &&
                  active.length === 0) ||
                (mode !== "trash" && row.archivedViaFolderId === ref.id)
              ) {
                affected.add(row.id);
                if (mode === "trash")
                  await tx
                    .update(file)
                    .set({ archivedViaFolderId: ref.id })
                    .where(and(eq(file.id, row.id), eq(file.userId, userId)));
              }
            }
          }
        }
        for (const fileId of affected) {
          const row = ownedFiles.find((x) => x.id === fileId)!;
          const activeMembership = links.some(
            (l) =>
              l.fileId === fileId && ownedFolders.some((f) => f.id === l.folderId && !f.archivedAt),
          );
          if (mode === "trash" && !row.archivedAt) {
            await tx
              .update(file)
              .set({ placement: "archived", archivedAt: now, updatedAt: now })
              .where(and(eq(file.id, fileId), eq(file.userId, userId)));
            await tx
              .delete(transcriptCache)
              .where(and(eq(transcriptCache.fileId, fileId), eq(transcriptCache.userId, userId)));
          } else if (mode === "restore")
            await tx
              .update(file)
              .set({
                placement: activeMembership ? "filed" : "inbox",
                archivedAt: null,
                archivedViaFolderId: null,
                purgeRequestedAt: null,
                updatedAt: now,
              })
              .where(and(eq(file.id, fileId), eq(file.userId, userId)));
          else if (mode === "purge")
            await tx
              .update(file)
              .set({ purgeRequestedAt: now, updatedAt: now })
              .where(and(eq(file.id, fileId), eq(file.userId, userId)));
        }
        await refreshFolderCentroidsTx(tx, userId, [
          ...new Set(
            links.filter((link) => affected.has(link.fileId)).map((link) => link.folderId),
          ),
        ]);
        await advanceCorpusRevision(tx, userId);
        return {};
      });
      if (result.missing)
        return yield* new NotFound({ entity: result.missing._tag, id: result.missing.id });
      if (result.conflict)
        return yield* new Conflict({
          reason: "Entry is not in trash or deletion has already started.",
        });
    }).pipe(Effect.mapError(toApiError));
  return {
    renameFile: (userId, fileId, title) =>
      provide(
        Effect.gen(function* () {
          yield* renameFile(userId, fileId, title);
          return yield* getFile(userId, fileId);
        }),
      ),
    getFileContentUrl: (userId, fileId) =>
      Effect.gen(function* () {
        const row = yield* getFile(userId, fileId);
        if (!row.storageKey) return yield* new NotFound({ entity: "File content", id: fileId });
        return {
          // Long enough for media range requests while a video plays.
          url: yield* storage.signedDownloadUrl(row.storageKey, 3600),
          mimeType: row.mimeType,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      }).pipe(Effect.mapError(toApiError)),
    getNote: (userId, fileId) =>
      Effect.gen(function* () {
        const row = yield* noteRow(userId, fileId);
        return {
          fileId,
          title: row.title,
          markdown: new TextDecoder().decode(yield* storage.get(StorageKey.make(row.storageKey!))),
          revision: revision(row),
        };
      }).pipe(Effect.mapError(toApiError)),
    createNote: (userId, input) =>
      Effect.gen(function* () {
        const fileId = yield* id(FileId);
        const jobId = yield* id(IngestionJobId);
        const eventId = yield* id(FileEventId);
        const rev = yield* newKeyVersion.pipe(Effect.provideService(Crypto.Crypto, crypto));
        const key = fileSourceKey(userId, fileId, "note.md", rev);
        yield* storage.put(key, input.markdown, { contentType: "text/markdown; charset=utf-8" });
        const result = yield* database
          .useTransaction(async (tx) => {
            await lockCorpus(tx, userId);
            const ids = [...new Set(input.folderIds)];
            const owned = ids.length
              ? await tx
                  .select()
                  .from(folder)
                  .where(
                    and(
                      eq(folder.userId, userId),
                      inArray(folder.id, ids),
                      isNull(folder.archivedAt),
                    ),
                  )
              : [];
            if (owned.length !== ids.length) return false;
            await tx.insert(file).values({
              id: fileId,
              userId,
              kind: "note",
              source: input.source ?? "user",
              title: input.title,
              placement: ids.length ? "filed" : "inbox",
              storageKey: key,
              dedupeKey: `note:${fileId}`,
              mimeType: "text/markdown",
              sizeBytes: Buffer.byteLength(input.markdown),
              preview: notePreview(input.markdown),
              noteRevision: rev,
              contentModifiedAt: new Date(),
            });
            if (ids.length)
              await tx
                .insert(fileFolder)
                .values(ids.map((folderId) => ({ fileId, folderId, userId })));
            await tx.insert(fileEvent).values({ id: eventId, userId, fileId, kind: "edited" });
            await enqueueIngestionTx(tx, userId, fileId, jobId);
            await advanceCorpusRevision(tx, userId);
            return true;
          })
          .pipe(Effect.onError(() => cleanupStaged(userId, fileId, key)));
        if (!result) {
          yield* cleanup(key);
          return yield* new NotFound({ entity: "Folder", id: input.folderIds.join(",") });
        }
        return yield* getFile(userId, fileId);
      }).pipe(Effect.uninterruptible, Effect.mapError(toApiError)),
    saveNote: (userId, input) =>
      Effect.gen(function* () {
        const before = yield* noteRow(userId, input.fileId);
        if (revision(before) !== input.baseRevision)
          return yield* new Conflict({ reason: "This note has changed. Reload before saving." });
        const rev = yield* newKeyVersion.pipe(Effect.provideService(Crypto.Crypto, crypto));
        const key = fileSourceKey(userId, input.fileId, "note.md", rev);
        const jobId = yield* id(IngestionJobId);
        const eventId = yield* id(FileEventId);
        yield* storage.put(key, input.markdown, { contentType: "text/markdown; charset=utf-8" });
        const outcome = yield* database
          .useTransaction(async (tx) => {
            await lockCorpus(tx, userId);
            const [row] = await tx
              .select()
              .from(file)
              .where(and(eq(file.id, input.fileId), eq(file.userId, userId)))
              .for("update");
            if (
              !row ||
              row.placement === "archived" ||
              row.purgeStartedAt ||
              revision(row) !== input.baseRevision
            )
              return null;
            const now = new Date();
            await tx
              .update(file)
              .set({
                title: input.title ?? row.title,
                storageKey: key,
                noteRevision: rev,
                contentModifiedAt: now,
                updatedAt: now,
                preview: notePreview(input.markdown),
                sizeBytes: Buffer.byteLength(input.markdown),
              })
              .where(and(eq(file.id, input.fileId), eq(file.userId, userId)));
            await tx
              .insert(fileEvent)
              .values({ id: eventId, userId, fileId: input.fileId, kind: "edited", at: now });
            await enqueueIngestionTx(tx, userId, input.fileId, jobId);
            await advanceCorpusRevision(tx, userId);
            return { oldKey: row.storageKey, title: input.title ?? row.title };
          })
          .pipe(Effect.onError(() => cleanupStaged(userId, input.fileId, key)));
        if (!outcome) {
          yield* cleanup(key);
          return yield* new Conflict({ reason: "This note has changed. Reload before saving." });
        }
        if (outcome.oldKey) yield* cleanup(StorageKey.make(outcome.oldKey));
        return {
          fileId: input.fileId,
          title: outcome.title,
          markdown: input.markdown,
          revision: rev,
        };
      }).pipe(Effect.uninterruptible, Effect.mapError(toApiError)),
    trashFiles: (userId, ids) =>
      trash(
        userId,
        ids.map((id) => ({ _tag: "file", id })),
        "trash",
      ),
    trashFolder: (userId, id) => trash(userId, [{ _tag: "folder", id }], "trash"),
    restore: (userId, refs) => trash(userId, refs, "restore"),
    purge: (userId, refs) => trash(userId, refs, "purge"),
    listTrash: (userId) =>
      Effect.gen(function* () {
        const archivedFolders = yield* folders(userId, true);
        const folderRows = yield* database.use((db) =>
          db
            .select()
            .from(folder)
            .where(and(eq(folder.userId, userId), isNotNull(folder.archivedAt))),
        );
        const rows = yield* database.use((db) =>
          db
            .select()
            .from(file)
            .where(
              and(
                eq(file.userId, userId),
                eq(file.placement, "archived"),
                isNull(file.archivedViaFolderId),
              ),
            ),
        );
        const files = yield* wireFiles(userId, rows);
        const entries: TrashEntry[] = [
          ...files.map((f) => ({ _tag: "file" as const, file: f, purgeAt: f.purgeAt! })),
          ...archivedFolders.map((f) => ({
            _tag: "folder" as const,
            folder: f,
            purgeAt: purgeAt(folderRows.find((row) => row.id === f.id)!)!,
          })),
        ];
        return entries.sort((a, b) => a.purgeAt.localeCompare(b.purgeAt));
      }).pipe(Effect.mapError(toApiError)),
    emptyTrash: (userId) =>
      Effect.gen(function* () {
        const files = yield* database.use((db) =>
          db
            .select({ id: file.id })
            .from(file)
            .where(
              and(
                eq(file.userId, userId),
                eq(file.placement, "archived"),
                isNull(file.purgeStartedAt),
              ),
            ),
        );
        const folders = yield* database.use((db) =>
          db
            .select({ id: folder.id })
            .from(folder)
            .where(
              and(
                eq(folder.userId, userId),
                isNotNull(folder.archivedAt),
                isNull(folder.purgeStartedAt),
              ),
            ),
        );
        const refs: TrashRef[] = [
          ...files.map((f) => ({ _tag: "file" as const, id: FileId.make(f.id) })),
          ...folders.map((f) => ({ _tag: "folder" as const, id: FolderId.make(f.id) })),
        ];
        if (refs.length) yield* trash(userId, refs, "purge");
      }).pipe(Effect.mapError(toApiError)),
  };
};
