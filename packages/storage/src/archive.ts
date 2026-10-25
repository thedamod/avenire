/** Reversible archival followed by claimed, recoverable retention cleanup. */
import {
  Conflict,
  FileId,
  NotFound,
  type UserId,
  UserId as UserIdSchema,
} from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import {
  advanceCorpusRevision,
  lockCorpus,
  refreshFolderCentroidsTx,
} from "@avenire/database/corpus";
import { file, folder, fileFolder, transcriptCache } from "@avenire/database/schema";
import { and, eq, exists, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { makeFilePurger } from "./purge.ts";

export const ARCHIVE_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 100;
const TRANSCRIPT_GC_BATCH_SIZE = 1000;

/** Retention is thirty elapsed days; files exactly at the cutoff are retained. */
export const archiveCutoff = (nowMillis: number): number =>
  nowMillis - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Archive, private derivative deletion and corpus publication share one transaction. */
export const archiveFile = Effect.fn("Archive.archiveFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const rows = yield* database.useTransaction(async (tx) => {
    await lockCorpus(tx, userId);
    const rows = await tx
      .update(file)
      .set({
        placement: "archived",
        archivedAt: sql`coalesce(${file.archivedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(file.id, fileId), eq(file.userId, userId), isNull(file.purgeStartedAt)))
      .returning({ id: file.id });
    if (rows.length > 0) {
      await tx
        .delete(transcriptCache)
        .where(and(eq(transcriptCache.fileId, fileId), eq(transcriptCache.userId, userId)));
      await refreshFolderCentroidsTx(tx, userId);
      await advanceCorpusRevision(tx, userId);
    }
    return rows;
  });
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
});

/** Restores membership-bearing files to filed and other files to inbox. */
export const restoreStatement = (
  db: Pick<DatabaseClient, "update" | "select">,
  userId: UserId,
  fileId: FileId,
) =>
  db
    .update(file)
    .set({
      placement: sql`case when ${exists(
        db
          .select({ fileId: fileFolder.fileId })
          .from(fileFolder)
          .innerJoin(
            folder,
            and(
              eq(folder.id, fileFolder.folderId),
              eq(folder.userId, userId),
              isNull(folder.archivedAt),
            ),
          )
          .where(and(eq(fileFolder.fileId, file.id), eq(fileFolder.userId, file.userId))),
      )} then 'filed' else 'inbox' end`,
      archivedAt: null,
      archivedViaFolderId: null,
      purgeRequestedAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(file.id, fileId), eq(file.userId, userId), isNull(file.purgeStartedAt)))
    .returning({ id: file.id });

export const restoreFile = Effect.fn("Archive.restoreFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const outcome = yield* database.useTransaction(async (tx) => {
    await lockCorpus(tx, userId);
    const rows = await restoreStatement(tx, userId, fileId);
    if (rows.length > 0) {
      await refreshFolderCentroidsTx(tx, userId);
      await advanceCorpusRevision(tx, userId);
      return "restored" as const;
    }
    // The user lock keeps this ownership-scoped diagnosis atomic with the failed restore.
    const [claimed] = await tx
      .select({ id: file.id })
      .from(file)
      .where(and(eq(file.id, fileId), eq(file.userId, userId), isNotNull(file.purgeStartedAt)))
      .limit(1);
    return claimed === undefined ? ("missing" as const) : ("purging" as const);
  });
  if (outcome === "purging") {
    return yield* new Conflict({
      reason: "File deletion has already started and cannot be restored.",
    });
  }
  if (outcome === "missing") return yield* new NotFound({ entity: "File", id: fileId });
});

/** Claim is atomic with restore, remains irreversible, and is retried after storage failures. */
export const claimPurgeStatement = (
  db: Pick<DatabaseClient, "update">,
  userId: UserId,
  fileId: FileId,
  cutoff: Date,
) =>
  db
    .update(file)
    .set({
      purgeStartedAt: sql`coalesce(${file.purgeStartedAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(file.id, fileId),
        eq(file.userId, userId),
        eq(file.placement, "archived"),
        or(
          isNotNull(file.purgeStartedAt),
          lte(file.purgeRequestedAt, sql`now()`),
          lt(file.archivedAt, cutoff),
        ),
      ),
    )
    .returning({ id: file.id });

/** No object removal is possible until an owned expired file has been claimed. */
export const purgeFile = Effect.fn("Archive.purgeFileOwned")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const now = yield* DateTime.now;
  return yield* makeFilePurger({
    claim: (owner, id) =>
      database.useTransaction(async (tx) => {
        await lockCorpus(tx, owner);
        const rows = await claimPurgeStatement(
          tx,
          owner,
          id,
          new Date(archiveCutoff(DateTime.toEpochMillis(now))),
        );
        if (rows.length === 0) return false;
        await tx
          .delete(transcriptCache)
          .where(and(eq(transcriptCache.fileId, id), eq(transcriptCache.userId, owner)));
        await advanceCorpusRevision(tx, owner);
        return true;
      }),
    complete: (owner, id) =>
      database.useTransaction(async (tx) => {
        await lockCorpus(tx, owner);
        const rows = await tx
          .delete(file)
          .where(and(eq(file.id, id), eq(file.userId, owner), isNotNull(file.purgeStartedAt)))
          .returning({ id: file.id });
        if (rows.length === 0) return false;
        await refreshFolderCentroidsTx(tx, owner);
        await advanceCorpusRevision(tx, owner);
        return true;
      }),
  })(userId, fileId);
});

/** Bounded physical erasure of expired plaintext, including inactive owners. */
export const collectExpiredTranscripts = Effect.fn("Archive.collectExpiredTranscripts")(
  function* () {
    const database = yield* Database;
    return yield* database.use((db) => {
      // ctid is a PostgreSQL system column, so only that expression needs raw SQL.
      const expired = db
        .select({ ctid: sql<string>`ctid` })
        .from(transcriptCache)
        .where(lte(transcriptCache.expiresAt, sql`now()`))
        .orderBy(transcriptCache.expiresAt)
        .limit(TRANSCRIPT_GC_BATCH_SIZE)
        .for("update", { skipLocked: true });
      return db.delete(transcriptCache).where(sql`ctid in (${expired})`);
    });
  },
);

/** At most one hundred expired files per tick; cascading deletes clean up their metadata. */
export const purgeArchived = Effect.fn("Archive.purgeArchived")(function* () {
  const database = yield* Database;
  yield* collectExpiredTranscripts();
  const now = yield* DateTime.now;
  const dueFolders = yield* database.use((db) =>
    db
      .select({ id: folder.id, userId: folder.userId })
      .from(folder)
      .where(
        and(
          isNotNull(folder.archivedAt),
          or(
            isNotNull(folder.purgeStartedAt),
            lte(folder.purgeRequestedAt, DateTime.toDateUtc(now)),
            lt(folder.archivedAt, new Date(archiveCutoff(DateTime.toEpochMillis(now)))),
          ),
        ),
      )
      .orderBy(folder.archivedAt, folder.id)
      .limit(PURGE_BATCH_SIZE),
  );
  for (const row of dueFolders)
    yield* database.useTransaction(async (tx) => {
      await lockCorpus(tx, row.userId);
      const claimed = await tx
        .update(folder)
        .set({ purgeStartedAt: sql`coalesce(${folder.purgeStartedAt}, now())` })
        .where(
          and(
            eq(folder.id, row.id),
            eq(folder.userId, row.userId),
            isNotNull(folder.archivedAt),
            or(
              isNotNull(folder.purgeStartedAt),
              lte(folder.purgeRequestedAt, DateTime.toDateUtc(now)),
              lt(folder.archivedAt, new Date(archiveCutoff(DateTime.toEpochMillis(now)))),
            ),
          ),
        )
        .returning({ id: folder.id });
      if (claimed.length)
        await tx
          .update(file)
          .set({ purgeRequestedAt: DateTime.toDateUtc(now) })
          .where(
            and(
              eq(file.userId, row.userId),
              eq(file.archivedViaFolderId, row.id),
              eq(file.placement, "archived"),
            ),
          );
    });
  const expired = yield* database.use((db) =>
    db
      .select({ id: file.id, userId: file.userId })
      .from(file)
      .where(
        and(
          eq(file.placement, "archived"),
          or(
            isNotNull(file.purgeStartedAt),
            lte(file.purgeRequestedAt, sql`now()`),
            lt(file.archivedAt, new Date(archiveCutoff(DateTime.toEpochMillis(now)))),
          ),
        ),
      )
      .orderBy(file.archivedAt, file.id)
      .limit(PURGE_BATCH_SIZE),
  );
  const purged = yield* Effect.forEach(expired, (row) =>
    purgeFile(UserIdSchema.make(row.userId), FileId.make(row.id)),
  );
  for (const row of dueFolders)
    yield* database.useTransaction(async (tx) => {
      await lockCorpus(tx, row.userId);
      const remaining = await tx
        .select({ id: file.id })
        .from(file)
        .where(and(eq(file.userId, row.userId), eq(file.archivedViaFolderId, row.id)))
        .limit(1);
      if (!remaining.length)
        await tx
          .delete(folder)
          .where(
            and(
              eq(folder.id, row.id),
              eq(folder.userId, row.userId),
              isNotNull(folder.purgeStartedAt),
            ),
          );
    });
  yield* Effect.logInfo("Purged archived files", {
    found: expired.length,
    purged: purged.filter(Boolean).length,
    skipped: purged.filter((value) => !value).length,
  });
});

/** Scoped hourly cleanup; a failed tick is logged and the scheduler keeps running. */
export const ArchivePurgeLive = Layer.effectDiscard(
  Effect.repeat(
    purgeArchived().pipe(
      Effect.catchCause((cause) => Effect.logError("Archive purge tick failed", { cause })),
    ),
    Schedule.spaced("1 hour"),
  ).pipe(Effect.forkScoped),
);
