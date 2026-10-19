/** Reversible library archival and storage-first retention cleanup. */
import { FileId, NotFound, type UserId, UserId as UserIdSchema } from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { file, fileFolder } from "@avenire/database/schema";
import { and, eq, exists, lt, sql } from "drizzle-orm";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { filePrefix } from "./keys.ts";
import { Storage, type StorageError } from "./storage.ts";

export const ARCHIVE_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 100;

/** Retention is thirty elapsed days; files exactly at the cutoff are retained. */
export const archiveCutoff = (nowMillis: number): number =>
  nowMillis - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Archives the user's file. Callers invalidate retrieval caches. */
export const archiveFile = Effect.fn("Archive.archiveFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const rows = yield* database.use((db) =>
    db
      .update(file)
      .set({ placement: "archived", archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(file.id, fileId), eq(file.userId, userId)))
      .returning({ id: file.id }),
  );
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
});

/** Restores membership-bearing files to filed and other files to inbox. */
export const restoreStatement = (db: DatabaseClient, userId: UserId, fileId: FileId) =>
  db
    .update(file)
    .set({
      placement: sql`case when ${exists(
        db
          .select({ fileId: fileFolder.fileId })
          .from(fileFolder)
          .where(and(eq(fileFolder.fileId, file.id), eq(fileFolder.userId, file.userId))),
      )} then 'filed' else 'inbox' end`,
      archivedAt: null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(file.id, fileId), eq(file.userId, userId)))
    .returning({ id: file.id });

export const restoreFile = Effect.fn("Archive.restoreFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const rows = yield* database.use((db) => restoreStatement(db, userId, fileId));
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
});

/** Deletes a row only after all of its objects have been removed. Storage failures retain it. */
export const purgeFile = Effect.fn("Archive.purgeFile")(function* <E, R>(
  userId: UserId,
  fileId: FileId,
  deleteRow: Effect.Effect<void, E, R>,
) {
  const storage = yield* Storage;
  const removed = yield* Effect.gen(function* () {
    const objects = yield* storage.list(filePrefix(userId, fileId));
    yield* Effect.forEach(objects, ({ key }) => storage.remove(key), { discard: true });
    return true;
  }).pipe(
    Effect.catchTag("StorageError", (error: StorageError) =>
      Effect.as(
        Effect.logWarning("Archive purge storage failed; retaining file", { fileId, error }),
        false,
      ),
    ),
  );
  if (!removed) return false;
  yield* deleteRow;
  return true;
});

/** At most one hundred expired files per tick; cascading deletes clean up their metadata. */
export const purgeArchived = Effect.fn("Archive.purgeArchived")(function* () {
  const database = yield* Database;
  const now = yield* DateTime.now;
  const expired = yield* database.use((db) =>
    db
      .select({ id: file.id, userId: file.userId })
      .from(file)
      .where(
        and(
          eq(file.placement, "archived"),
          lt(file.archivedAt, new Date(archiveCutoff(DateTime.toEpochMillis(now)))),
        ),
      )
      .orderBy(file.archivedAt, file.id)
      .limit(PURGE_BATCH_SIZE),
  );
  const purged = yield* Effect.forEach(expired, (row) =>
    purgeFile(
      UserIdSchema.make(row.userId),
      FileId.make(row.id),
      database
        .use((db) => db.delete(file).where(and(eq(file.id, row.id), eq(file.userId, row.userId))))
        .pipe(Effect.asVoid),
    ),
  );
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
