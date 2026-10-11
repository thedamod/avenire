import { FolderId, type FileId, type UserId } from "@avenire/contracts";
import { Database, type DatabaseTransaction } from "@avenire/database/client";
import { chunk, folder, fileFolder } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { toVectorLiteral } from "./text.ts";

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

export const runningMean = (
  current: ReadonlyArray<number>,
  count: number,
  next: ReadonlyArray<number>,
) => next.map((value, index) => ((current[index] ?? 0) * count + value) / (count + 1));

/** Files at least this similar to a folder's centroid join it instead of starting a new one. */
const JOIN_THRESHOLD = 0.8;
const FOLDER_NAME_LENGTH = 48;

const nearestFolder = (tx: DatabaseTransaction, userId: UserId, vector: ReadonlyArray<number>) =>
  tx
    .select({ id: folder.id, centroid: folder.centroid })
    .from(folder)
    .where(and(eq(folder.userId, userId), sql`${folder.centroid} IS NOT NULL`))
    .orderBy(sql`${folder.centroid} <=> ${toVectorLiteral(vector)}::vector`)
    .limit(1)
    .then(([nearest]) => nearest);

/** Folds the file into the centroid, unless it was already a member (re-ingestion). */
const updateCentroid = async (
  tx: DatabaseTransaction,
  userId: UserId,
  fileId: FileId,
  folderId: string,
  centroid: ReadonlyArray<number>,
  vector: ReadonlyArray<number>,
) => {
  const inFolder = and(eq(fileFolder.userId, userId), eq(fileFolder.folderId, folderId));
  const [membership] = await tx
    .select({ fileId: fileFolder.fileId })
    .from(fileFolder)
    .where(and(inFolder, eq(fileFolder.fileId, fileId)))
    .limit(1);
  if (membership !== undefined) return;
  const [members] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(fileFolder)
    .where(inFolder);
  await tx
    .update(folder)
    .set({
      centroid: [...runningMean(centroid, members?.count ?? 0, vector)],
      updatedAt: sql`now()`,
    })
    .where(and(eq(folder.id, folderId), eq(folder.userId, userId)));
};

/**
 * Files an file into its nearest suggested folder, or starts a new folder named
 * after the file. Runs in one transaction so the centroid and membership agree.
 */
export const assignFolders = Effect.fn("Folders.assign")(function* (
  userId: UserId,
  fileId: FileId,
  title: string,
) {
  const database = yield* Database;
  const newFolderId = yield* newId(FolderId);
  return yield* database
    .useTransaction(async (tx) => {
      const [fileEmbedding] = await tx
        .select({
          vector: sql<ReadonlyArray<number> | null>`avg(${chunk.embedding})`.mapWith(
            chunk.embedding,
          ),
        })
        .from(chunk)
        .where(and(eq(chunk.userId, userId), eq(chunk.fileId, fileId)));
      const fileVector = fileEmbedding?.vector;
      if (fileVector == null) return null;
      const nearest = await nearestFolder(tx, userId, fileVector);
      let folderId: FolderId = newFolderId;
      if (nearest?.centroid && cosineSimilarity(nearest.centroid, fileVector) >= JOIN_THRESHOLD) {
        folderId = FolderId.make(nearest.id);
        await updateCentroid(tx, userId, fileId, folderId, nearest.centroid, fileVector);
      } else {
        await tx.insert(folder).values({
          id: folderId,
          userId,
          name: title.slice(0, FOLDER_NAME_LENGTH) || "Untitled",
          suggested: true,
          centroid: [...fileVector],
        });
      }
      await tx.insert(fileFolder).values({ fileId, folderId, userId }).onConflictDoNothing();
      return folderId;
    })
    .pipe(Effect.mapError((cause) => new FolderError({ cause })));
});
