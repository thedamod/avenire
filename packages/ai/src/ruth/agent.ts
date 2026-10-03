/**
 * Ruth's turn loop. A turn streams the model's reply, runs tools as the model asks
 * for them (up to MAX_STEPS model calls), and emits typed RuthEvents as it goes.
 * File actions only ever become pending approvals; `decide` is the one place that
 * applies them, after the user has said yes.
 */
import {
  type ApprovalDecision,
  type ApprovalId,
  type Citation,
  Conflict,
  type FileAction,
  ItemId,
  type Message,
  MessageId,
  type MessagePart,
  NotFound,
  type RuthEvent,
  ThreadId,
  type UserId,
} from "@avenire/contracts";
import { Sandboxes } from "@avenire/cloud/sandbox";
import { Database } from "@avenire/database/client";
import {
  cluster,
  item,
  itemCluster,
  ruthApproval,
  type RuthMessageRow,
  ruthMessage,
  ruthThread,
} from "@avenire/database/schema";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { enqueueIngestion } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { itemSourceKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, sql } from "drizzle-orm";
import * as LanguageModel from "effect/ai/LanguageModel";
import * as Prompt from "effect/ai/Prompt";
import * as Response from "effect/ai/Response";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { RuthModelLive } from "../models.ts";
import { RUTH_SYSTEM_PROMPT } from "./prompt.ts";
import {
  RuthToolkit,
  RuthToolsLive,
  RuthTurn,
  toolResultCitations,
  toolResultParts,
} from "./tools.ts";

const MAX_STEPS = 8;
const THREAD_TITLE_LENGTH = 60;

export class RuthError extends Schema.TaggedError<RuthError>()("RuthError", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Ruth could not ${this.operation}: ${detail}`;
  }
}

export interface SendInput {
  readonly userId: UserId;
  readonly threadId?: ThreadId | undefined;
  readonly text: string;
}

export interface DecideInput {
  readonly userId: UserId;
  readonly approvalId: ApprovalId;
  readonly decision: ApprovalDecision;
}

export class Ruth extends Context.Service<
  Ruth,
  {
    /** Fails with NotFound when `threadId` is not one of the user's threads. */
    readonly send: (input: SendInput) => Stream.Stream<RuthEvent, RuthError | NotFound>;
    /** Fails with Conflict when the approval was already decided. */
    readonly decide: (
      input: DecideInput,
    ) => Stream.Stream<RuthEvent, RuthError | NotFound | Conflict>;
  }
>()("avenire/ai/Ruth") {}

/** History is replayed as plain text; tool payloads are summarised, not re-sent. */
const partToText = (part: MessagePart): string => {
  switch (part._tag) {
    case "text":
      return part.text;
    case "code":
      return `[ran Python]\n${part.source}\n[output]\n${part.stdout}`;
    case "widget":
      return `[showed widget: ${part.title}]`;
    case "plot":
      return `[showed plot: ${part.alt}]`;
    case "video":
      return `[showed video: ${part.title}]`;
    case "approval":
      return "[proposed a file action for approval]";
  }
};

export const historyToPrompt = (messages: ReadonlyArray<Message>, note?: string): Prompt.Prompt =>
  Prompt.make([
    {
      role: "system",
      content: note === undefined ? RUTH_SYSTEM_PROMPT : `${RUTH_SYSTEM_PROMPT}\n\n${note}`,
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.parts.map(partToText).join("\n\n"),
    })),
  ]);

const toMessage = (row: RuthMessageRow): Message => ({
  id: MessageId.make(row.id),
  threadId: ThreadId.make(row.threadId),
  role: row.role,
  parts: row.parts,
  createdAt: row.createdAt.toISOString(),
});

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

const decisionNote = (decision: ApprovalDecision): string =>
  `The user ${decision} your proposed file action, and it was ` +
  `${decision === "approved" ? "applied" : "not applied"}. ` +
  "Acknowledge this briefly and continue helping.";

/** What one model call produced: its text, why it stopped, and the parts to replay. */
interface StepResult {
  readonly text: string;
  readonly finishReason: Response.FinishReason | undefined;
  readonly responseParts: ReadonlyArray<Response.AnyPart>;
}

/** Collects what a turn contributes to the final assistant message. */
interface TurnAccumulator {
  readonly toolParts: Array<MessagePart>;
  readonly citations: Map<string, Citation>;
}

const makeRuth = Effect.gen(function* () {
  const database = yield* Database;
  const storage = yield* Storage;
  const model = yield* LanguageModel.LanguageModel;
  const toolkit = yield* RuthToolkit;
  // Tool handlers need these per call; capture them once and provide them to each turn.
  const toolServices = yield* Effect.context<
    Database | Storage | Retrieval | Sandboxes | Crypto.Crypto
  >();

  /** Infrastructure failures surface as RuthError; domain errors are kept as they are. */
  const failWith = (operation: string) => (cause: unknown) =>
    Effect.fail(new RuthError({ operation, cause }));

  const loadMessages = (userId: UserId, threadId: ThreadId) =>
    database
      .use((db) =>
        db.query.ruthMessage.findMany({
          where: and(eq(ruthMessage.threadId, threadId), eq(ruthMessage.userId, userId)),
          orderBy: [asc(ruthMessage.createdAt)],
        }),
      )
      .pipe(Effect.map((rows) => rows.map(toMessage)));

  const saveMessage = (userId: UserId, message: Message) =>
    database.use((db) =>
      db.insert(ruthMessage).values({
        id: message.id,
        threadId: message.threadId,
        userId,
        role: message.role,
        parts: message.parts,
      }),
    );

  const ensureThread = Effect.fn("Ruth.ensureThread")(function* (input: SendInput) {
    if (input.threadId === undefined) {
      const id = yield* newId(ThreadId);
      const title = input.text.slice(0, THREAD_TITLE_LENGTH);
      yield* database.use((db) =>
        db.insert(ruthThread).values({ id, userId: input.userId, title }),
      );
      return id;
    }
    const threadId = input.threadId;
    const owned = yield* database.use((db) =>
      db.query.ruthThread.findFirst({
        columns: { id: true },
        where: and(eq(ruthThread.id, threadId), eq(ruthThread.userId, input.userId)),
      }),
    );
    if (owned === undefined) return yield* new NotFound({ entity: "Thread", id: threadId });
    return threadId;
  });

  /** One model call: streams text to the client and records tool results as it goes. */
  const runStep = (
    prompt: Prompt.Prompt,
    messageId: MessageId,
    emit: (event: RuthEvent) => Effect.Effect<boolean>,
    turn: TurnAccumulator,
  ) =>
    Effect.gen(function* () {
      let text = "";
      let finishReason: Response.FinishReason | undefined;
      const responseParts: Array<Response.AnyPart> = [];

      yield* Stream.runForEach(model.streamText({ prompt, toolkit }), (part) =>
        Effect.gen(function* () {
          switch (part.type) {
            case "text-delta":
              text += part.delta;
              yield* emit({ _tag: "text-delta", messageId, delta: part.delta });
              return;
            case "tool-call":
              responseParts.push(part);
              return;
            case "tool-result":
              responseParts.push(part);
              for (const citation of toolResultCitations(part)) {
                turn.citations.set(citation.chunkId, citation);
              }
              for (const messagePart of toolResultParts(part)) {
                turn.toolParts.push(messagePart);
                yield* emit({ _tag: "part", messageId, part: messagePart });
              }
              if (part.name === "propose_file_action" && !part.isFailure) {
                yield* emit({ _tag: "approval-requested", approval: part.result });
              }
              return;
            case "finish":
              finishReason = part.reason;
              return;
          }
        }),
      );
      const result: StepResult = { text, finishReason, responseParts };
      return result;
    });

  /** One assistant reply: stream model steps, run tools, persist the final message. */
  const runTurn = (
    userId: UserId,
    threadId: ThreadId,
    history: ReadonlyArray<Message>,
    note?: string,
  ) =>
    Stream.callback<RuthEvent, unknown>((queue) =>
      Effect.gen(function* () {
        const emit = (event: RuthEvent) => Queue.offer(queue, event);
        const messageId = yield* newId(MessageId);
        yield* emit({ _tag: "message-started", messageId });

        const turn: TurnAccumulator = { toolParts: [], citations: new Map() };
        let replyText = "";
        let prompt = historyToPrompt(history, note);
        for (let step = 0; step < MAX_STEPS; step++) {
          const result = yield* runStep(prompt, messageId, emit, turn);
          replyText += result.text;
          if (result.finishReason !== "tool-calls") break;
          const assistantText =
            result.text === "" ? [] : [Response.makePart("text", { text: result.text })];
          prompt = Prompt.concat(
            prompt,
            Prompt.fromResponseParts([...assistantText, ...result.responseParts]),
          );
        }

        // Cite only the chunks the reply actually refers to.
        const cited = [...turn.citations.values()].filter((citation) =>
          replyText.includes(citation.chunkId),
        );
        const textParts: ReadonlyArray<MessagePart> =
          replyText === "" ? [] : [{ _tag: "text", text: replyText, citations: cited }];
        const message: Message = {
          id: messageId,
          threadId,
          role: "assistant",
          parts: [...textParts, ...turn.toolParts],
          createdAt: yield* nowIso,
        };
        yield* saveMessage(userId, message);
        yield* emit({ _tag: "message-completed", message });
        yield* Queue.end(queue);
      }).pipe(Effect.provideContext(Context.add(toolServices, RuthTurn, { userId, threadId }))),
    ).pipe(Stream.mapError((cause) => new RuthError({ operation: "reply", cause })));

  /** Saves the user's message and returns the stream of Ruth's reply. */
  const startReply = Effect.fn("Ruth.send")(function* (input: SendInput) {
    const threadId = yield* ensureThread(input);
    const userMessage: Message = {
      id: yield* newId(MessageId),
      threadId,
      role: "user",
      parts: [{ _tag: "text", text: input.text, citations: [] }],
      createdAt: yield* nowIso,
    };
    yield* saveMessage(input.userId, userMessage);
    const history = yield* loadMessages(input.userId, threadId);
    return runTurn(input.userId, threadId, history);
  }, Effect.provideContext(toolServices));

  const moveItem = Effect.fn("Ruth.moveItem")(function* (
    userId: UserId,
    action: Extract<FileAction, { readonly _tag: "move" }>,
  ) {
    const moved = yield* database.useTransaction(async (tx) => {
      const target = await tx.query.cluster.findFirst({
        columns: { id: true },
        where: and(eq(cluster.id, action.toClusterId), eq(cluster.userId, userId)),
      });
      const owned = await tx.query.item.findFirst({
        columns: { id: true },
        where: and(eq(item.id, action.itemId), eq(item.userId, userId)),
      });
      if (target === undefined || owned === undefined) return false;
      await tx
        .delete(itemCluster)
        .where(and(eq(itemCluster.itemId, action.itemId), eq(itemCluster.userId, userId)));
      await tx.insert(itemCluster).values({ itemId: action.itemId, clusterId: target.id, userId });
      return true;
    });
    if (!moved) return yield* new NotFound({ entity: "Item or cluster", id: action.itemId });
  });

  const createNote = Effect.fn("Ruth.createNote")(function* (
    userId: UserId,
    action: Extract<FileAction, { readonly _tag: "create-note" }>,
  ) {
    const id = yield* newId(ItemId);
    const storageKey = itemSourceKey(userId, id, "note.md");
    const bytes = new TextEncoder().encode(action.markdown);
    yield* storage.put(storageKey, bytes, { contentType: "text/markdown" });
    yield* database.use((db) =>
      db.insert(item).values({
        id,
        userId,
        kind: "note",
        title: action.title,
        storageKey,
        mimeType: "text/markdown",
        sizeBytes: bytes.byteLength,
        dedupeKey: `ruth-note:${id}`,
      }),
    );
    yield* enqueueIngestion(userId, id);
  });

  const applyAction = (userId: UserId, action: FileAction) => {
    const ownedItem = (itemId: ItemId) => and(eq(item.id, itemId), eq(item.userId, userId));
    switch (action._tag) {
      case "move":
        return moveItem(userId, action);
      case "rename":
        return database.use((db) =>
          db.update(item).set({ title: action.title }).where(ownedItem(action.itemId)),
        );
      case "delete":
        // Archive rather than delete, so a mistaken approval is recoverable.
        return database.use((db) =>
          db.update(item).set({ placement: "archived" }).where(ownedItem(action.itemId)),
        );
      case "create-note":
        return createNote(userId, action);
    }
  };

  /** Records the decision, applies an approved action, and returns Ruth's follow-up. */
  const applyDecision = Effect.fn("Ruth.decide")(function* (input: DecideInput) {
    // The status guard makes deciding idempotent under double-clicks.
    const [approval] = yield* database.use((db) =>
      db
        .update(ruthApproval)
        .set({ status: input.decision, decidedAt: sql`now()` })
        .where(
          and(
            eq(ruthApproval.id, input.approvalId),
            eq(ruthApproval.userId, input.userId),
            eq(ruthApproval.status, "pending"),
          ),
        )
        .returning(),
    );
    if (approval === undefined) {
      return yield* new Conflict({ reason: "This approval is no longer pending" });
    }
    if (input.decision === "approved") yield* applyAction(input.userId, approval.action);

    const threadId = ThreadId.make(approval.threadId);
    const history = yield* loadMessages(input.userId, threadId);
    return runTurn(input.userId, threadId, history, decisionNote(input.decision));
  }, Effect.provideContext(toolServices));

  return Ruth.of({
    send: (input) =>
      Stream.unwrap(
        Effect.catchTag(
          startReply(input),
          "NotFound",
          (error) => Effect.fail(error),
          failWith("start the reply"),
        ),
      ),
    decide: (input) =>
      Stream.unwrap(
        Effect.catchTag(
          applyDecision(input),
          ["NotFound", "Conflict"],
          (error) => Effect.fail(error),
          failWith("apply the decision"),
        ),
      ),
  });
});

export const RuthLive = Layer.effect(Ruth, makeRuth).pipe(
  Layer.provide([RuthModelLive, RuthToolsLive]),
);
