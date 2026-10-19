/** Shared database invariants for library publication and its derived projections. */
import type { UserId } from "@avenire/contracts";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "./client.ts";
import { chunk, file, fileFolder, folder, user } from "./schema.ts";

/** Acquire this lock before file/job/folder locks in a library mutation transaction. */
export const lockCorpus = async (tx: DatabaseTransaction, userId: string): Promise<void> => {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
};

/** Publish cache invalidity in the same transaction as the canonical mutation. */
export const advanceCorpusRevision = async (
  tx: DatabaseTransaction,
  userId: string,
): Promise<void> => {
  await tx
    .update(user)
    .set({ corpusRevision: sql`${user.corpusRevision} + 1` })
    .where(eq(user.id, userId));
};

/** Equal weight per file; empty/archived/purging memberships contribute no vector. */
export const refreshFolderCentroidsTx = async (
  tx: DatabaseTransaction,
  userId: UserId,
  folderIds?: ReadonlyArray<string>,
): Promise<void> => {
  if (folderIds?.length === 0) return;
  const member = tx
    .select({
      vector: sql`avg(${chunk.embedding})`.as("vector"),
    })
    .from(fileFolder)
    .innerJoin(file, and(eq(file.id, fileFolder.fileId), eq(file.userId, fileFolder.userId)))
    .innerJoin(chunk, and(eq(chunk.fileId, file.id), eq(chunk.userId, file.userId)))
    .where(
      and(
        eq(fileFolder.folderId, folder.id),
        eq(fileFolder.userId, userId),
        isNull(file.archivedAt),
        isNull(file.purgeStartedAt),
        ne(file.placement, "archived"),
        isNotNull(chunk.embedding),
      ),
    )
    .groupBy(file.id)
    .as("member");
  const average = tx.select({ centroid: sql`avg(${member.vector})` }).from(member);
  await tx
    .update(folder)
    .set({ centroid: sql`(${average})`, updatedAt: sql`now()` })
    .where(
      and(
        eq(folder.userId, userId),
        folderIds === undefined ? undefined : inArray(folder.id, [...folderIds]),
      ),
    );
};
