/** Ownership-scoped library activity and content modification timestamps. */
import {
  FileEventId,
  type FileEventKind,
  type FileId,
  NotFound,
  type UserId,
} from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { file, fileEvent } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, eq, sql } from "drizzle-orm";
import * as Effect from "effect/Effect";

/** One statement distinguishes a missing file from a debounced opened event. */
export const fileEventStatement = (
  userId: UserId,
  fileId: FileId,
  id: FileEventId,
  kind: FileEventKind,
  metadata?: Record<string, unknown>,
) => sql`
  WITH owned AS MATERIALIZED (
    SELECT id, user_id FROM file WHERE id = ${fileId} AND user_id = ${userId} FOR UPDATE
  ), inserted AS (
    INSERT INTO file_event (id, user_id, file_id, kind, metadata)
    SELECT ${id}, user_id, id, ${kind}, ${JSON.stringify(metadata ?? {})}::jsonb FROM owned
    WHERE ${kind} <> 'opened' OR NOT EXISTS (
      SELECT 1 FROM file_event e WHERE e.user_id = ${userId} AND e.file_id = ${fileId}
        AND e.kind = 'opened' AND e.at >= now() - interval '10 minutes'
    ) RETURNING id
  ) SELECT id FROM owned`;

/** Records activity only for the user's file; opened activity is debounced for ten minutes. */
export const recordFileEvent = Effect.fn("FileEvents.recordFileEvent")(function* (
  userId: UserId,
  fileId: FileId,
  kind: FileEventKind,
  metadata?: Record<string, unknown>,
) {
  const database = yield* Database;
  const id = yield* newId(FileEventId).pipe(
    Effect.mapError((cause) => new DatabaseError({ cause })),
  );
  const rows = yield* database.use((db) =>
    db.execute(fileEventStatement(userId, fileId, id, kind, metadata)),
  );
  if (rows.length === 0) return yield* new NotFound({ entity: "File", id: fileId });
});

/** Updates the content timestamp and records the edit atomically. */
export const markContentChanged = Effect.fn("FileEvents.markContentChanged")(function* (
  userId: UserId,
  fileId: FileId,
  contentHash?: string,
) {
  const database = yield* Database;
  const id = yield* newId(FileEventId).pipe(
    Effect.mapError((cause) => new DatabaseError({ cause })),
  );
  const changed = yield* database.useTransaction(async (tx) => {
    const rows = await tx
      .update(file)
      .set({
        contentModifiedAt: sql`now()`,
        updatedAt: sql`now()`,
        ...(contentHash === undefined ? {} : { contentHash }),
      })
      .where(and(eq(file.id, fileId), eq(file.userId, userId)))
      .returning({ id: file.id });
    if (rows.length === 0) return false;
    await tx.insert(fileEvent).values({ id, userId, fileId, kind: "edited" });
    return true;
  });
  if (!changed) return yield* new NotFound({ entity: "File", id: fileId });
});
