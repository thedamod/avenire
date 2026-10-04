/**
 * Ruth's chat turn on the AI SDK. The server owns a thread's history: a request
 * carries only the client's latest message, which either continues the last
 * assistant message (an approval response or an `ask_user` answer) or starts a
 * new user turn. The reply streams as UI message chunks and is persisted when
 * the stream ends. File actions pause on a signed approval unless the thread has
 * Full access.
 */
import {
  MessageId,
  NotFound,
  type PageContext,
  type RuthMessage,
  type RuthThread,
  ThreadId,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  type RuthMessageRow,
  ruthMessage,
  type RuthThreadRow,
  ruthThread,
} from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import {
  convertToModelMessages,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type FlexibleSchema,
  type InferUIMessageChunk,
} from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Config from "effect/Config";

import {
  incomingMessageSchemas,
  ruthMessageSchemas,
  type RuthUIMessage,
} from "../message-types.ts";
import {
  RUTH_DEFAULT_MODEL,
  RUTH_FAST_MODEL,
  RuthModels,
  RuthModelsLive,
} from "../models/index.ts";
import { RUTH_PROMPT } from "../prompts/ruth.ts";
import { ruthToolSpecs } from "../tools/index.ts";
import { findVisuals } from "../tools/page.ts";
import { createRuthTools, type RuthToolServices, type RuthTurn } from "../tools/ruth.ts";

const MAX_STEPS = 8;
const DEFAULT_THREAD_TITLE = "New thread";
const STREAM_ERROR = "Ruth ran into a problem. Please try again.";

export class RuthError extends Schema.TaggedError<RuthError>()("RuthError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Ruth could not ${this.operation}: ${detail}`;
  }
}

export interface ChatInput {
  readonly userId: UserId;
  readonly threadId: ThreadId;
  /** The client's latest `RuthUIMessage`, still unvalidated JSON. */
  readonly message: unknown;
  readonly page: PageContext;
  readonly fast?: boolean | undefined;
}

export type RuthChatStream = ReadableStream<InferUIMessageChunk<RuthUIMessage>>;

export class Ruth extends Context.Service<
  Ruth,
  {
    /**
     * Runs one turn and returns its UI message stream (wrap it with
     * `createUIMessageStreamResponse`). Fails with NotFound when the thread is not
     * the user's, and with RuthError when the message is invalid.
     */
    readonly chat: (input: ChatInput) => Effect.Effect<RuthChatStream, RuthError | NotFound>;
    readonly listThreads: (userId: UserId) => Effect.Effect<ReadonlyArray<RuthThread>, RuthError>;
    readonly createThread: (userId: UserId, title?: string) => Effect.Effect<RuthThread, RuthError>;
    readonly listMessages: (
      userId: UserId,
      threadId: ThreadId,
    ) => Effect.Effect<ReadonlyArray<RuthMessage>, RuthError | NotFound>;
    readonly setFullAccess: (
      userId: UserId,
      threadId: ThreadId,
      enabled: boolean,
    ) => Effect.Effect<RuthThread, RuthError | NotFound>;
  }
>()("avenire/ai/Ruth") {}

/**
 * The conversation a turn runs on. A message that matches the last assistant
 * message continues it (keeping the stored metadata); anything else is a new
 * user message stamped with `createdAt`, with a fresh id if its id is taken.
 */
export const appendIncoming = (
  history: ReadonlyArray<RuthUIMessage>,
  incoming: RuthUIMessage,
  options: { readonly freshId: string; readonly createdAt: string },
): Array<RuthUIMessage> => {
  const last = history.at(-1);
  if (last !== undefined && last.role === "assistant" && last.id === incoming.id) {
    return [
      ...history.slice(0, -1),
      {
        ...incoming,
        role: "assistant",
        ...(last.metadata === undefined ? {} : { metadata: last.metadata }),
      },
    ];
  }
  const taken = history.some((message) => message.id === incoming.id);
  const references = incoming.metadata?.references;
  return [
    ...history,
    {
      ...incoming,
      id: taken ? options.freshId : incoming.id,
      role: "user",
      metadata: {
        createdAt: options.createdAt,
        ...(references === undefined ? {} : { references }),
      },
    },
  ];
};

const toThread = (row: RuthThreadRow): RuthThread => ({
  id: ThreadId.make(row.id),
  title: row.title,
  fullAccess: row.fullAccess,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toStoredMessage = (row: RuthMessageRow): RuthMessage => ({
  id: MessageId.make(row.id),
  role: row.role,
  parts: row.parts,
  metadata: row.metadata,
  createdAt: row.createdAt.toISOString(),
});

/**
 * The Ruth agent for one turn: model, system prompt, tools and approval policy.
 * Spread it into `streamText` with the conversation's messages. Full access still
 * routes file actions through approval (as "approved") so they show in the stream.
 */
export const createRuthAgent = (options: {
  readonly models: RuthModels["Service"];
  readonly services: Context.Context<RuthToolServices>;
  readonly turn: RuthTurn;
  readonly fullAccess: boolean;
  readonly fast?: boolean | undefined;
}) => ({
  model: options.models.languageModel(options.fast === true ? RUTH_FAST_MODEL : RUTH_DEFAULT_MODEL),
  system: RUTH_PROMPT({ fullAccess: options.fullAccess }),
  tools: createRuthTools(options.services, options.turn),
  toolApproval: {
    propose_file_action: options.fullAccess ? ("approved" as const) : ("user-approval" as const),
  },
  stopWhen: stepCountIs(MAX_STEPS),
});

const textOf = (messages: ReadonlyArray<RuthUIMessage>): Array<string> =>
  messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    );

const makeRuth = Effect.gen(function* () {
  const database = yield* Database;
  const models = yield* RuthModels;
  const approvalSecret = yield* Config.Redacted("RUTH_APPROVAL_SECRET");
  // Tools and stream callbacks run outside Effect; they run their programs with these.
  const services = yield* Effect.context<RuthToolServices>();

  const fail = (operation: string) => (cause: unknown) => new RuthError({ operation, cause });
  const makeId = <Id extends string>(schema: { readonly make: (input: string) => Id }) =>
    newId(schema).pipe(Effect.mapError(fail("create an id")), Effect.provideContext(services));

  const findThread = Effect.fn("Ruth.findThread")(function* (userId: UserId, threadId: ThreadId) {
    const row = yield* database
      .use((db) =>
        db.query.ruthThread.findFirst({
          where: and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId)),
        }),
      )
      .pipe(Effect.mapError(fail("load the thread")));
    if (row === undefined) return yield* new NotFound({ entity: "Thread", id: threadId });
    return row;
  });

  const loadRows = (userId: UserId, threadId: ThreadId) =>
    database
      .use((db) =>
        db.query.ruthMessage.findMany({
          where: and(eq(ruthMessage.threadId, threadId), eq(ruthMessage.userId, userId)),
          orderBy: [asc(ruthMessage.createdAt), asc(ruthMessage.id)],
        }),
      )
      .pipe(Effect.mapError(fail("load the messages")));

  /** Checks messages against Ruth's tools, metadata and data part schemas. */
  const validate = (
    operation: string,
    messages: unknown,
    schemas: {
      readonly metadataSchema: FlexibleSchema<unknown>;
      readonly dataSchemas: typeof ruthMessageSchemas.dataSchemas;
    } = ruthMessageSchemas,
  ) =>
    Effect.tryPromise({
      try: () =>
        safeValidateUIMessages<RuthUIMessage>({
          messages,
          tools: ruthToolSpecs,
          ...schemas,
        }),
      catch: fail(operation),
    }).pipe(
      Effect.flatMap((result) =>
        result.success ? Effect.succeed(result.data) : Effect.fail(fail(operation)(result.error)),
      ),
    );

  /** Upserts messages by id, never touching a row of another user or thread. */
  const saveMessages = (
    userId: UserId,
    threadId: ThreadId,
    messages: ReadonlyArray<RuthUIMessage>,
  ) =>
    Effect.forEach(
      messages,
      (message) =>
        database.use((db) =>
          db
            .insert(ruthMessage)
            .values({
              id: message.id,
              threadId,
              userId,
              role: message.role,
              parts: message.parts,
              metadata: message.metadata ?? null,
            })
            .onConflictDoUpdate({
              target: ruthMessage.id,
              set: { parts: message.parts, metadata: message.metadata ?? null },
              setWhere: sql`${ruthMessage.userId} = ${userId} and ${ruthMessage.threadId} = ${threadId}`,
            }),
        ),
      { discard: true },
    ).pipe(
      Effect.andThen(
        database.use((db) =>
          db
            .update(ruthThread)
            .set({ updatedAt: sql`now()` })
            .where(eq(ruthThread.id, threadId)),
        ),
      ),
      Effect.asVoid,
      Effect.mapError(fail("save the messages")),
    );

  const chat = Effect.fn("Ruth.chat")(function* (input: ChatInput) {
    const thread = yield* findThread(input.userId, input.threadId);
    const rows = yield* loadRows(input.userId, input.threadId);
    const history = yield* validate(
      "read the thread history",
      rows.map((row) => ({
        id: row.id,
        role: row.role,
        parts: row.parts,
        ...(row.metadata === null || row.metadata === undefined ? {} : { metadata: row.metadata }),
      })),
    );
    const [incoming] = yield* validate("read the message", [input.message], incomingMessageSchemas);
    if (incoming === undefined) {
      return yield* new RuthError({ operation: "read the message", cause: "it is missing" });
    }

    const createdAt = DateTime.formatIso(yield* DateTime.now);
    const freshId = yield* makeId(MessageId);
    const conversation = appendIncoming(history, incoming, { freshId, createdAt });
    yield* saveMessages(input.userId, input.threadId, conversation.slice(-1));

    const agent = createRuthAgent({
      models,
      services,
      fullAccess: thread.fullAccess,
      fast: input.fast,
      turn: {
        userId: input.userId,
        threadId: input.threadId,
        page: input.page,
        existingVisuals: findVisuals(textOf(conversation)),
      },
    });
    const modelMessages = yield* Effect.tryPromise({
      try: () => convertToModelMessages(conversation, { tools: agent.tools }),
      catch: fail("prepare the conversation"),
    });
    const responseId = yield* makeId(MessageId);
    // A continued reply keeps its original timestamp.
    const last = conversation.at(-1);
    const replyMetadata =
      last?.role === "assistant" && last.metadata ? last.metadata : { createdAt };

    const result = streamText({
      ...agent,
      messages: modelMessages,
      experimental_toolApprovalSecret: Redacted.value(approvalSecret),
    });

    const stream: RuthChatStream = toUIMessageStream<typeof agent.tools, RuthUIMessage>({
      stream: result.stream,
      tools: agent.tools,
      originalMessages: conversation,
      generateMessageId: () => responseId,
      messageMetadata: ({ part }) => (part.type === "start" ? replyMetadata : undefined),
      onError: (error) => {
        Effect.runForkWith(services)(Effect.logError("Ruth chat stream failed", { error }));
        return STREAM_ERROR;
      },
      onEnd: ({ responseMessage }) =>
        Effect.runPromiseWith(services)(
          saveMessages(input.userId, input.threadId, [responseMessage]).pipe(
            Effect.catchCause((cause) => Effect.logError("Could not save Ruth's reply", cause)),
          ),
        ),
    });
    return stream;
  });

  return Ruth.of({
    chat,

    listThreads: Effect.fn("Ruth.listThreads")(function* (userId) {
      const rows = yield* database
        .use((db) =>
          db.query.ruthThread.findMany({
            where: eq(ruthThread.userId, userId),
            orderBy: [desc(ruthThread.updatedAt)],
          }),
        )
        .pipe(Effect.mapError(fail("list threads")));
      return rows.map(toThread);
    }),

    createThread: Effect.fn("Ruth.createThread")(function* (userId, title) {
      const id = yield* makeId(ThreadId);
      const [row] = yield* database
        .use((db) =>
          db
            .insert(ruthThread)
            .values({ id, userId, title: title?.trim() || DEFAULT_THREAD_TITLE })
            .returning(),
        )
        .pipe(Effect.mapError(fail("create the thread")));
      if (row === undefined) {
        return yield* new RuthError({ operation: "create the thread", cause: "no row returned" });
      }
      return toThread(row);
    }),

    listMessages: Effect.fn("Ruth.listMessages")(function* (userId, threadId) {
      yield* findThread(userId, threadId);
      const rows = yield* loadRows(userId, threadId);
      return rows.map(toStoredMessage);
    }),

    setFullAccess: Effect.fn("Ruth.setFullAccess")(function* (userId, threadId, enabled) {
      const [row] = yield* database
        .use((db) =>
          db
            .update(ruthThread)
            .set({ fullAccess: enabled, updatedAt: sql`now()` })
            .where(and(eq(ruthThread.id, threadId), eq(ruthThread.userId, userId)))
            .returning(),
        )
        .pipe(Effect.mapError(fail("update the thread")));
      if (row === undefined) return yield* new NotFound({ entity: "Thread", id: threadId });
      return toThread(row);
    }),
  });
});

export const RuthLive = Layer.effect(Ruth, makeRuth).pipe(Layer.provide(RuthModelsLive));
