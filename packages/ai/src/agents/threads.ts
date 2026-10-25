/** Conversation persistence has no model, sandbox, or provider configuration dependency. */
import {
  Conflict,
  FolderId,
  MessageId,
  NotFound,
  ThreadId,
  type RuthMessage,
  type RuthThread,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { folder, ruthMessage, ruthThread, type RuthThreadRow } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

export class ThreadStoreError extends Schema.TaggedError<ThreadStoreError>()("ThreadStoreError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

export class ThreadStore extends Context.Service<
  ThreadStore,
  {
    readonly listThreads: (
      userId: UserId,
    ) => Effect.Effect<readonly RuthThread[], ThreadStoreError>;
    readonly createThread: (
      userId: UserId,
      title?: string,
      folderId?: FolderId,
    ) => Effect.Effect<RuthThread, ThreadStoreError | Conflict | NotFound>;
    readonly getThread: (
      userId: UserId,
      threadId: ThreadId,
    ) => Effect.Effect<RuthThread, ThreadStoreError | NotFound>;
    readonly renameThread: (
      userId: UserId,
      threadId: ThreadId,
      title: string,
    ) => Effect.Effect<RuthThread, ThreadStoreError | NotFound | Conflict>;
    readonly deleteThread: (
      userId: UserId,
      threadId: ThreadId,
    ) => Effect.Effect<void, ThreadStoreError | NotFound>;
    readonly listMessages: (
      userId: UserId,
      threadId: ThreadId,
    ) => Effect.Effect<readonly RuthMessage[], ThreadStoreError | NotFound>;
    readonly setFullAccess: (
      userId: UserId,
      threadId: ThreadId,
      enabled: boolean,
    ) => Effect.Effect<RuthThread, ThreadStoreError | NotFound>;
  }
>()("avenire/ai/ThreadStore") {}

const toThread = (row: RuthThreadRow): RuthThread => ({
  id: ThreadId.make(row.id),
  kind: row.kind,
  title: row.title,
  fullAccess: row.fullAccess,
  folderId: row.folderId ? FolderId.make(row.folderId) : null,
  preview: null,
  lastMessageAt: null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const ThreadStoreLive = Layer.effect(
  ThreadStore,
  Effect.gen(function* () {
    const database = yield* Database;
    const crypto = yield* Crypto.Crypto;
    const fail = (operation: string) => (cause: unknown) =>
      new ThreadStoreError({ operation, cause });
    const wire = Effect.fn(function* (rows: readonly RuthThreadRow[]) {
      if (!rows.length) return [];
      const ids = rows.map((row) => row.id);
      const latest = yield* database
        .use((db) =>
          db
            .selectDistinctOn([ruthMessage.threadId], {
              threadId: ruthMessage.threadId,
              createdAt: ruthMessage.createdAt,
            })
            .from(ruthMessage)
            .where(and(eq(ruthMessage.userId, rows[0]!.userId), inArray(ruthMessage.threadId, ids)))
            .orderBy(asc(ruthMessage.threadId), desc(ruthMessage.createdAt), desc(ruthMessage.id)),
        )
        .pipe(Effect.mapError(fail("read thread timestamps")));
      const replies = yield* database
        .use((db) =>
          db
            .selectDistinctOn([ruthMessage.threadId], {
              threadId: ruthMessage.threadId,
              parts: ruthMessage.parts,
            })
            .from(ruthMessage)
            .where(
              and(
                eq(ruthMessage.userId, rows[0]!.userId),
                inArray(ruthMessage.threadId, ids),
                eq(ruthMessage.role, "assistant"),
              ),
            )
            .orderBy(asc(ruthMessage.threadId), desc(ruthMessage.createdAt), desc(ruthMessage.id)),
        )
        .pipe(Effect.mapError(fail("read thread previews")));
      const lastByThread = new Map(latest.map((m) => [m.threadId, m]));
      const replyByThread = new Map(replies.map((m) => [m.threadId, m]));
      return rows.map((row) => {
        const last = lastByThread.get(row.id);
        const assistant = replyByThread.get(row.id);
        const text = assistant?.parts.find(
          (p): p is { type: "text"; text: string } =>
            typeof p === "object" &&
            p !== null &&
            "type" in p &&
            p.type === "text" &&
            "text" in p &&
            typeof p.text === "string",
        );
        return {
          ...toThread(row),
          preview: text?.text.slice(0, 140) ?? null,
          lastMessageAt: last?.createdAt.toISOString() ?? null,
        };
      });
    });
    const getThread = Effect.fn(function* (userId: UserId, threadId: ThreadId) {
      const [row] = yield* database
        .use((db) =>
          db
            .select()
            .from(ruthThread)
            .where(and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId))),
        )
        .pipe(Effect.mapError(fail("get thread")));
      if (!row) return yield* new NotFound({ entity: "Thread", id: threadId });
      return (yield* wire([row]))[0]!;
    });
    return ThreadStore.of({
      getThread,
      renameThread: Effect.fn(function* (userId, threadId, title) {
        if (!title.trim() || title.trim().length > 200)
          return yield* new Conflict({ reason: "Invalid thread title." });
        yield* getThread(userId, threadId);
        yield* database
          .use((db) =>
            db
              .update(ruthThread)
              .set({ title: title.trim(), updatedAt: new Date() })
              .where(and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId))),
          )
          .pipe(Effect.mapError(fail("rename thread")));
        return yield* getThread(userId, threadId);
      }),
      deleteThread: Effect.fn(function* (userId, threadId) {
        const rows = yield* database
          .use((db) =>
            db
              .delete(ruthThread)
              .where(and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId)))
              .returning({ id: ruthThread.id }),
          )
          .pipe(Effect.mapError(fail("delete thread")));
        if (!rows.length) return yield* new NotFound({ entity: "Thread", id: threadId });
      }),
      listThreads: Effect.fn("ThreadStore.listThreads")(function* (userId) {
        const rows = yield* database
          .use((db) =>
            db.query.ruthThread.findMany({
              where: eq(ruthThread.userId, userId),
              orderBy: [desc(ruthThread.updatedAt), desc(ruthThread.id)],
            }),
          )
          .pipe(Effect.mapError(fail("list threads")));
        return yield* wire(rows);
      }),
      createThread: Effect.fn("ThreadStore.createThread")(function* (userId, title, folderId) {
        const normalized = title?.trim() || "New thread";
        if (normalized.length > 200)
          return yield* new Conflict({
            reason: "Thread titles must contain at most 200 characters.",
          });
        const id = yield* newId(ThreadId).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.mapError(fail("create an id")),
        );
        if (folderId) {
          const [owned] = yield* database
            .use((db) =>
              db
                .select({ id: folder.id })
                .from(folder)
                .where(
                  and(
                    eq(folder.id, folderId),
                    eq(folder.userId, userId),
                    isNull(folder.archivedAt),
                  ),
                ),
            )
            .pipe(Effect.mapError(fail("get folder")));
          if (!owned) return yield* new NotFound({ entity: "Folder", id: folderId });
        }
        const [row] = yield* database
          .use((db) =>
            db.insert(ruthThread).values({ id, userId, title: normalized, folderId }).returning(),
          )
          .pipe(Effect.mapError(fail("create the thread")));
        if (!row)
          return yield* new ThreadStoreError({
            operation: "create the thread",
            cause: "no row returned",
          });
        return (yield* wire([row]))[0]!;
      }),
      listMessages: Effect.fn("ThreadStore.listMessages")(function* (userId, threadId) {
        const owned = yield* database
          .use((db) =>
            db.query.ruthThread.findFirst({
              where: and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId)),
            }),
          )
          .pipe(Effect.mapError(fail("load the thread")));
        if (!owned) return yield* new NotFound({ entity: "Thread", id: threadId });
        const rows = yield* database
          .use((db) =>
            db.query.ruthMessage.findMany({
              where: and(eq(ruthMessage.threadId, threadId), eq(ruthMessage.userId, userId)),
              orderBy: [asc(ruthMessage.createdAt), asc(ruthMessage.id)],
            }),
          )
          .pipe(Effect.mapError(fail("load the messages")));
        return rows.map((row) => ({
          id: MessageId.make(row.id),
          role: row.role,
          parts: row.parts,
          metadata: row.metadata,
          createdAt: row.createdAt.toISOString(),
        }));
      }),
      setFullAccess: Effect.fn("ThreadStore.setFullAccess")(function* (userId, threadId, enabled) {
        const [row] = yield* database
          .use((db) =>
            db
              .update(ruthThread)
              .set({ fullAccess: enabled, updatedAt: sql`now()` })
              .where(and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId)))
              .returning(),
          )
          .pipe(Effect.mapError(fail("update the thread")));
        if (!row) return yield* new NotFound({ entity: "Thread", id: threadId });
        return (yield* wire([row]))[0]!;
      }),
    });
  }),
);
