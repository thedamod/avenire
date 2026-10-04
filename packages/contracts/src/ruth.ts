/**
 * Ruth - the study agent that explains concepts from the user's own material.
 *
 * Chat messages are AI SDK `UIMessage`s (typed as `RuthUIMessage` in
 * `@avenire/ai/ruth-messages`); here they travel as opaque JSON. Streaming goes
 * over a plain HTTP endpoint (`RUTH_CHAT_PATH`), thread management over RPC.
 * File actions pause on an approval tool part unless the thread has Full access.
 */
import * as Schema from "effect/Schema";

import { ItemId, MessageId, ThreadId } from "./ids.ts";

/** Path the chat stream endpoint is mounted on, relative to the web server origin. */
export const RUTH_CHAT_PATH = "/api/ruth/chat";

export const RuthThread = Schema.Struct({
  id: ThreadId,
  title: Schema.String,
  /** When on, Ruth applies file actions without asking (still logged and undoable). */
  fullAccess: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type RuthThread = typeof RuthThread.Type;

/** A persisted `RuthUIMessage`; parts and metadata are the AI SDK's JSON. */
export const RuthMessage = Schema.Struct({
  id: MessageId,
  role: Schema.Literals(["system", "user", "assistant"]),
  parts: Schema.Array(Schema.Unknown),
  metadata: Schema.Unknown,
  createdAt: Schema.String,
});
export type RuthMessage = typeof RuthMessage.Type;

export const FileAction = Schema.Union([
  Schema.TaggedStruct("move", { itemId: ItemId, toClusterId: Schema.String }),
  Schema.TaggedStruct("rename", { itemId: ItemId, title: Schema.String }),
  Schema.TaggedStruct("delete", { itemId: ItemId }),
  Schema.TaggedStruct("create-note", { title: Schema.String, markdown: Schema.String }),
]);
export type FileAction = typeof FileAction.Type;

/** What the client knows about the page a visual will render into. */
export const PageContext = Schema.Struct({
  surface: Schema.Literals(["chat", "note", "canvas"]),
  platform: Schema.Literals(["desktop", "web", "mobile"]),
  contentWidthPx: Schema.Int,
  colorScheme: Schema.Literals(["light", "dark"]),
  themeTokens: Schema.Record(Schema.String, Schema.String),
  fonts: Schema.Struct({ body: Schema.String, mono: Schema.String }),
});
export type PageContext = typeof PageContext.Type;

/**
 * Body of a `RUTH_CHAT_PATH` request. The client sends only its latest message
 * (via `prepareSendMessagesRequest`); the server owns the thread's history and
 * validates `message` against Ruth's tools.
 */
export const RuthChatRequest = Schema.Struct({
  threadId: ThreadId,
  message: Schema.Unknown,
  page: PageContext,
  fast: Schema.optional(Schema.Boolean),
});
export type RuthChatRequest = typeof RuthChatRequest.Type;
