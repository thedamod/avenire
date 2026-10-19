/** Conversation persistence has no model, sandbox, or provider configuration dependency. */
import {
  Conflict,
  MessageId,
  NotFound,
  ThreadId,
  type RuthMessage,
  type RuthThread,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { ruthMessage, ruthThread, type RuthThreadRow } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
    ) => Effect.Effect<RuthThread, ThreadStoreError | Conflict>;
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
    return ThreadStore.of({
      listThreads: Effect.fn("ThreadStore.listThreads")(function* (userId) {
        const rows = yield* database
          .use((db) =>
            db.query.ruthThread.findMany({
              where: eq(ruthThread.userId, userId),
              orderBy: [desc(ruthThread.updatedAt), desc(ruthThread.id)],
            }),
          )
          .pipe(Effect.mapError(fail("list threads")));
        return rows.map(toThread);
      }),
      createThread: Effect.fn("ThreadStore.createThread")(function* (userId, title) {
        const normalized = title?.trim() || "New thread";
        if (normalized.length > 200)
          return yield* new Conflict({
            reason: "Thread titles must contain at most 200 characters.",
          });
        const id = yield* newId(ThreadId).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.mapError(fail("create an id")),
        );
        const [row] = yield* database
          .use((db) => db.insert(ruthThread).values({ id, userId, title: normalized }).returning())
          .pipe(Effect.mapError(fail("create the thread")));
        if (!row)
          return yield* new ThreadStoreError({
            operation: "create the thread",
            cause: "no row returned",
          });
        return toThread(row);
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
        return toThread(row);
      }),
    });
  }),
);
