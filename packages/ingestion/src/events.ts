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
import { and, eq, gte, sql } from "drizzle-orm";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

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
  const now = yield* DateTime.now;
  const recentAfter = new Date(DateTime.toEpochMillis(now) - 10 * 60 * 1000);
  const owned = yield* database.useTransaction(async (tx) => {
    const rows = await tx
      .select({ id: file.id })
      .from(file)
      .where(and(eq(file.id, fileId), eq(file.userId, userId)))
      .for("update");
    if (rows.length === 0) return false;
    if (kind === "opened") {
      const recent = await tx
        .select({ id: fileEvent.id })
        .from(fileEvent)
        .where(
          and(
            eq(fileEvent.userId, userId),
            eq(fileEvent.fileId, fileId),
            eq(fileEvent.kind, "opened"),
            gte(fileEvent.at, recentAfter),
          ),
        )
        .limit(1);
      if (recent.length > 0) return true;
    }
    await tx.insert(fileEvent).values({ id, userId, fileId, kind, metadata: metadata ?? {} });
    return true;
  });
  if (!owned) return yield* new NotFound({ entity: "File", id: fileId });
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
