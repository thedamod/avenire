import { defaultNotebookAppearance } from "@avenire/shared/notebook";
import { FolderId, NotFound, type FileId, type UserId } from "@avenire/contracts";
import { Database, type DatabaseTransaction } from "@avenire/database/client";
import {
  advanceCorpusRevision,
  lockCorpus,
  refreshFolderCentroidsTx,
} from "@avenire/database/corpus";
import { chunk, file, fileFolder, folder } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, cosineDistance, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export { refreshFolderCentroidsTx } from "@avenire/database/corpus";

export class FolderError extends Schema.TaggedError<FolderError>()("FolderError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Folder assignment failed: ${detail}`;
  }
}

export const cosineSimilarity = (
  left: ReadonlyArray<number>,
  right: ReadonlyArray<number>,
): number => {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const a = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const b = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  return a && b ? dot / (a * b) : 0;
};

/** Files at least this similar to a folder's centroid join it instead of starting a new one. */
const JOIN_THRESHOLD = 0.8;
const FOLDER_NAME_LENGTH = 48;

const nearestFolder = (tx: DatabaseTransaction, userId: UserId, vector: ReadonlyArray<number>) =>
  tx
    .select({ id: folder.id, centroid: folder.centroid })
    .from(folder)
    .where(and(eq(folder.userId, userId), isNull(folder.archivedAt), isNotNull(folder.centroid)))
    .orderBy(cosineDistance(folder.centroid, [...vector]), folder.id)
    .limit(1)
    .then(([nearest]) => nearest);

/** Every membership mutation takes locks in the same order as corpus publication. */
const lockLiveFile = async (tx: DatabaseTransaction, userId: UserId, fileId: FileId) => {
  await lockCorpus(tx, userId);
  const [owned] = await tx
    .select({ id: file.id })
    .from(file)
    .where(
      and(
        eq(file.id, fileId),
        eq(file.userId, userId),
        isNull(file.archivedAt),
        isNull(file.purgeStartedAt),
        ne(file.placement, "archived"),
      ),
    )
    .for("update");
  return owned !== undefined;
};

/** Lock the complete affected set in id order, after the corpus and file locks. */
const lockOwnedFolders = async (
  tx: DatabaseTransaction,
  userId: UserId,
  folderIds: ReadonlyArray<string>,
): Promise<boolean> => {
  const ids = [...new Set(folderIds)].sort();
  if (ids.length === 0) return true;
  const owned = await tx
    .select({ id: folder.id })
    .from(folder)
    .where(and(eq(folder.userId, userId), inArray(folder.id, ids)))
    .orderBy(folder.id)
    .for("update");
  return owned.length === ids.length;
};

/**
 * Replace all memberships and maintain their aggregates in the caller's transaction.
 * A missing or inaccessible file/folder leaves both memberships and placement intact.
 * The corpus lock also serializes this operation with embedding publication and archive.
 * This helper advances the corpus revision; callers must not advance it again.
 */
export const setFileFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  folderIds: ReadonlyArray<FolderId>,
): Promise<boolean> => {
  if (!(await lockLiveFile(tx, userId, fileId))) return false;
  const ids = [...new Set(folderIds)].sort();
  const previous = await tx
    .select({ id: fileFolder.folderId })
    .from(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)));
  const affected = [...new Set([...ids, ...previous.map((row) => row.id)])].sort();
  if (!(await lockOwnedFolders(tx, userId, affected))) return false;
  if (
    ids.length &&
    (
      await tx
        .select({ id: folder.id })
        .from(folder)
        .where(and(eq(folder.userId, userId), inArray(folder.id, ids), isNull(folder.archivedAt)))
    ).length !== ids.length
  )
    return false;
  await tx
    .delete(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)));
  if (ids.length > 0) {
    await tx.insert(fileFolder).values(ids.map((folderId) => ({ userId, fileId, folderId })));
  }
  await tx
    .update(file)
    .set({ placement: ids.length > 0 ? "filed" : "inbox", updatedAt: sql`now()` })
    .where(and(eq(file.id, fileId), eq(file.userId, userId)));
  await refreshFolderCentroidsTx(tx, userId, affected);
  await advanceCorpusRevision(tx, userId);
  return true;
};

export const setFileFolders = Effect.fn("Folders.setFileFolders")(function* (
  userId: UserId,
  fileId: FileId,
  folderIds: ReadonlyArray<FolderId>,
) {
  const database = yield* Database;
  const changed = yield* database.useTransaction((tx) =>
    setFileFoldersTx(tx, userId, fileId, folderIds),
  );
  if (!changed) return yield* new NotFound({ entity: "File or folder", id: fileId });
});

/**
 * Assign from the embeddings just published in this transaction. Existing memberships
 * remain authoritative on reingestion; their aggregate is rebuilt from current chunks.
 * The caller advances the corpus revision once its complete publication is committed.
 */
export const assignFoldersTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  title: string,
  newFolderId: FolderId,
): Promise<FolderId | null> => {
  if (!(await lockLiveFile(tx, userId, fileId))) return null;
  const previous = await tx
    .select({ id: fileFolder.folderId })
    .from(fileFolder)
    .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, fileId)))
    .orderBy(fileFolder.folderId);
  if (previous.length > 0) {
    if (
      !(await lockOwnedFolders(
        tx,
        userId,
        previous.map((row) => row.id),
      ))
    )
      return null;
    await refreshFolderCentroidsTx(
      tx,
      userId,
      previous.map((row) => row.id),
    );
    return FolderId.make(previous[0]!.id);
  }
  const [fileEmbedding] = await tx
    .select({
      vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(chunk.embedding),
    })
    .from(chunk)
    .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)));
  const vector = fileEmbedding?.vector;
  if (vector == null) return null;
  const nearest = await nearestFolder(tx, userId, vector);
  const joinsExisting =
    nearest?.centroid != null && cosineSimilarity(nearest.centroid, vector) >= JOIN_THRESHOLD;
  const folderId = joinsExisting ? FolderId.make(nearest!.id) : newFolderId;
  if (joinsExisting) {
    if (!(await lockOwnedFolders(tx, userId, [folderId]))) return null;
  } else {
    await tx.insert(folder).values({
      id: folderId,
      userId,
      name: title.slice(0, FOLDER_NAME_LENGTH) || "Untitled",
      suggested: true,
      ...defaultNotebookAppearance(title.slice(0, FOLDER_NAME_LENGTH) || "Untitled"),
    });
  }
  await tx.insert(fileFolder).values({ fileId, folderId, userId }).onConflictDoNothing();
  await refreshFolderCentroidsTx(tx, userId, [folderId]);
  return folderId;
};

export const assignFolders = Effect.fn("Folders.assign")(function* (
  userId: UserId,
  fileId: FileId,
  title: string,
) {
  const database = yield* Database;
  const newFolderId = yield* newId(FolderId);
  return yield* database
    .useTransaction(async (tx) => {
      const result = await assignFoldersTx(tx, userId, fileId, title, newFolderId);
      if (result !== null) await advanceCorpusRevision(tx, userId);
      return result;
    })
    .pipe(Effect.mapError((cause) => new FolderError({ cause })));
});
