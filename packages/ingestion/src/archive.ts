/** Reversible library archival and storage-first retention cleanup. */
import { ItemId, NotFound, type UserId, UserId as UserIdSchema } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { item } from "@avenire/database/schema";
import { itemPrefix } from "@avenire/storage/keys";
import { Storage, type StorageError } from "@avenire/storage/storage";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";

import { SemanticCache } from "./retrieval/cache.ts";

export const ARCHIVE_RETENTION_DAYS = 30;
const PURGE_BATCH_SIZE = 100;

/** Retention is thirty elapsed days; items exactly at the cutoff are retained. */
export const archiveCutoff = (nowMillis: number): number =>
  nowMillis - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Archives the user's item and discards its cached retrieval results. */
export const archiveItem = Effect.fn("Archive.archiveItem")(function* (
  userId: UserId,
  itemId: ItemId,
) {
  const database = yield* Database;
  const cache = yield* SemanticCache;
  const rows = yield* database.use((db) =>
    db
      .update(item)
      .set({ placement: "archived", archivedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(item.id, itemId), eq(item.userId, userId)))
      .returning({ id: item.id }),
  );
  if (rows.length === 0) return yield* new NotFound({ entity: "Item", id: itemId });
  yield* cache.invalidate(userId);
});

/** Restores membership-bearing items to filed and other items to inbox. */
export const restoreStatement = (userId: UserId, itemId: ItemId) => sql`
  UPDATE item i SET placement = CASE WHEN EXISTS (
    SELECT 1 FROM item_cluster ic WHERE ic.item_id = i.id AND ic.user_id = i.user_id
  ) THEN 'filed' ELSE 'inbox' END, archived_at = NULL, updated_at = now()
  WHERE i.id = ${itemId} AND i.user_id = ${userId} RETURNING i.id`;

export const restoreItem = Effect.fn("Archive.restoreItem")(function* (
  userId: UserId,
  itemId: ItemId,
) {
  const database = yield* Database;
  const cache = yield* SemanticCache;
  const rows = yield* database.use((db) => db.execute(restoreStatement(userId, itemId)));
  if (rows.length === 0) return yield* new NotFound({ entity: "Item", id: itemId });
  yield* cache.invalidate(userId);
});

/** Deletes a row only after all of its objects have been removed. Storage failures retain it. */
export const purgeItem = Effect.fn("Archive.purgeItem")(function* <E, R>(
  userId: UserId,
  itemId: ItemId,
  deleteRow: Effect.Effect<void, E, R>,
) {
  const storage = yield* Storage;
  const removed = yield* Effect.gen(function* () {
    const objects = yield* storage.list(itemPrefix(userId, itemId));
    yield* Effect.forEach(objects, ({ key }) => storage.remove(key), { discard: true });
    return true;
  }).pipe(
    Effect.catchTag("StorageError", (error: StorageError) =>
      Effect.as(
        Effect.logWarning("Archive purge storage failed; retaining item", { itemId, error }),
        false,
      ),
    ),
  );
  if (!removed) return false;
  yield* deleteRow;
  return true;
});

/** At most one hundred expired items per tick; cascading deletes clean up their metadata. */
export const purgeArchived = Effect.fn("Archive.purgeArchived")(function* () {
  const database = yield* Database;
  const expired = yield* database.use((db) =>
    db
      .select({ id: item.id, userId: item.userId })
      .from(item)
      .where(
        sql`${item.placement} = 'archived' AND ${item.archivedAt} < now() - ${ARCHIVE_RETENTION_DAYS} * interval '24 hours'`,
      )
      .orderBy(item.archivedAt, item.id)
      .limit(PURGE_BATCH_SIZE),
  );
  const purged = yield* Effect.forEach(expired, (row) =>
    purgeItem(
      UserIdSchema.make(row.userId),
      ItemId.make(row.id),
      database
        .use((db) => db.delete(item).where(and(eq(item.id, row.id), eq(item.userId, row.userId))))
        .pipe(Effect.asVoid),
    ),
  );
  yield* Effect.logInfo("Purged archived items", {
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
