/** Reversible library archival and storage-first retention cleanup. */
import { FileId, NotFound, type UserId, UserId as UserIdSchema } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { file } from "@avenire/database/schema";
import { filePrefix } from "@avenire/storage/keys";
import { Storage, type StorageError } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { SemanticCache } from "./retrieval/cache.ts";

export const ARCHIVE_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 100;

/** Retention is thirty elapsed days; files exactly at the cutoff are retained. */
export const archiveCutoff = (nowMillis: number): number =>
  nowMillis - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Archives the user's file and discards its cached retrieval results. */
export const archiveFile = Effect.fn("Archive.archiveFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const cache = yield* SemanticCache;
  const rows = yield* database.use((db) =>
    db
      .update(file)
      .set({ placement: "archived", archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(file.id, fileId), eq(file.userId, userId)))
      .returning({ id: file.id }),
  );
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
  yield* cache.invalidate(userId);
});

/** Restores membership-bearing files to filed and other files to inbox. */
export const restoreStatement = (userId: UserId, fileId: FileId) => sql`
  UPDATE file i SET placement = CASE WHEN EXISTS (
    SELECT 1 FROM file_folder ic WHERE ic.file_id = i.id AND ic.user_id = i.user_id
  ) THEN 'filed' ELSE 'inbox' END, archived_at = NULL, updated_at = now()
  WHERE i.id = ${fileId} AND i.user_id = ${userId} RETURNING i.id`;

export const restoreFile = Effect.fn("Archive.restoreFile")(function* (
  userId: UserId,
  fileId: FileId,
) {
  const database = yield* Database;
  const cache = yield* SemanticCache;
  const rows = yield* database.use((db) => db.execute(restoreStatement(userId, fileId)));
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
  yield* cache.invalidate(userId);
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
  const expired = yield* database.use((db) =>
    db
      .select({ id: file.id, userId: file.userId })
      .from(file)
      .where(
        sql`${file.placement} = 'archived' AND ${file.archivedAt} < now() - ${ARCHIVE_RETENTION_DAYS} * interval '24 hours'`,
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
