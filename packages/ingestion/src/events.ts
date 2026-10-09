/** Ownership-scoped library activity and content modification timestamps. */
import {
  ItemEventId,
  type ItemEventKind,
  type ItemId,
  NotFound,
  type UserId,
} from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { item, itemEvent } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";

/** One statement distinguishes a missing item from a debounced opened event. */
export const itemEventStatement = (
  userId: UserId,
  itemId: ItemId,
  id: ItemEventId,
  kind: ItemEventKind,
  metadata?: Record<string, unknown>,
) => sql`
  WITH owned AS MATERIALIZED (
    SELECT id, user_id FROM item WHERE id = ${itemId} AND user_id = ${userId} FOR UPDATE
  ), inserted AS (
    INSERT INTO item_event (id, user_id, item_id, kind, metadata)
    SELECT ${id}, user_id, id, ${kind}, ${JSON.stringify(metadata ?? {})}::jsonb FROM owned
    WHERE ${kind} <> 'opened' OR NOT EXISTS (
      SELECT 1 FROM item_event e WHERE e.user_id = ${userId} AND e.item_id = ${itemId}
        AND e.kind = 'opened' AND e.at >= now() - interval '10 minutes'
    ) RETURNING id
  ) SELECT id FROM owned`;

/** Records activity only for the user's item; opened activity is debounced for ten minutes. */
export const recordItemEvent = Effect.fn("ItemEvents.recordItemEvent")(function* (
  userId: UserId,
  itemId: ItemId,
  kind: ItemEventKind,
  metadata?: Record<string, unknown>,
) {
  const database = yield* Database;
  const id = yield* newId(ItemEventId).pipe(
    Effect.mapError((cause) => new DatabaseError({ cause })),
  );
  const rows = yield* database.use((db) =>
    db.execute(itemEventStatement(userId, itemId, id, kind, metadata)),
  );
  if (rows.length === 0) return yield* new NotFound({ entity: "Item", id: itemId });
});

/** Updates the content timestamp and records the edit atomically. */
export const markContentChanged = Effect.fn("ItemEvents.markContentChanged")(function* (
  userId: UserId,
  itemId: ItemId,
  contentHash?: string,
) {
  const database = yield* Database;
  const id = yield* newId(ItemEventId).pipe(
    Effect.mapError((cause) => new DatabaseError({ cause })),
  );
  const changed = yield* database.useTransaction(async (tx) => {
    const rows = await tx
      .update(item)
      .set({
        contentModifiedAt: sql`now()`,
        updatedAt: sql`now()`,
        ...(contentHash === undefined ? {} : { contentHash }),
      })
      .where(and(eq(item.id, itemId), eq(item.userId, userId)))
      .returning({ id: item.id });
    if (rows.length === 0) return false;
    await tx.insert(itemEvent).values({ id, userId, itemId, kind: "edited" });
    return true;
  });
  if (!changed) return yield* new NotFound({ entity: "Item", id: itemId });
});
