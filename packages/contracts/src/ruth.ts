/**
 * Ruth - the study agent that explains concepts from the user's own material.
 *
 * Chat messages are AI SDK `UIMessage`s (typed as `RuthUIMessage` in
 * `@avenire/ai/message-types`); here they travel as opaque JSON. Streaming goes
 * over a plain HTTP endpoint (`RUTH_CHAT_PATH`), thread management over RPC.
 * LibraryFile actions pause on an approval tool part unless the thread has Full access.
 */
import * as Schema from "effect/Schema";

import { FileId, FolderId, MessageId, ThreadId } from "./ids.ts";

/** Path the chat stream endpoint is mounted on, relative to the web server origin. */
export const RUTH_CHAT_PATH = "/api/ruth/chat";

export const RuthThreadKind = Schema.Literals(["chat", "ruth-cloud"]);
export type RuthThreadKind = typeof RuthThreadKind.Type;

export const RuthThread = Schema.Struct({
  id: ThreadId,
  kind: RuthThreadKind,
  title: Schema.String,
  /** When on, Ruth applies file actions without asking (still logged and undoable). */
  fullAccess: Schema.Boolean,
  /** The notebook the chat was started from; it scopes retrieval by default. */
  folderId: Schema.NullOr(FolderId),
  /** First ~140 chars of the last assistant text, for list rows. */
  preview: Schema.NullOr(Schema.String),
  lastMessageAt: Schema.NullOr(Schema.String),
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

/** What the client knows about the page a visual will render into. */
export const PageContext = Schema.Struct({
  surface: Schema.Literals(["chat", "note", "library"]),
  platform: Schema.Literals(["desktop", "web", "mobile"]),
  contentWidthPx: Schema.Int,
  colorScheme: Schema.Literals(["light", "dark"]),
  themeTokens: Schema.Record(Schema.String, Schema.String),
  fonts: Schema.Struct({ body: Schema.String, mono: Schema.String }),
});
export type PageContext = typeof PageContext.Type;

/**
 * What Ruth searches by default for a turn. Empty or missing = the whole library.
 * The composer's notebook / "This note" control sets it.
 */
export const ChatScope = Schema.Struct({
  folderIds: Schema.optionalKey(Schema.Array(FolderId).check(Schema.isMaxLength(50))),
  fileIds: Schema.optionalKey(Schema.Array(FileId).check(Schema.isMaxLength(200))),
});
export type ChatScope = typeof ChatScope.Type;

/**
 * Body of a `RUTH_CHAT_PATH` request. The client sends only its latest message
 * (via `prepareSendMessagesRequest`); the server owns the thread's history and
 * validates `message` against Ruth's tools.
 */
export const RuthChatRequest = Schema.Struct({
  threadId: ThreadId,
  message: Schema.Unknown,
  page: PageContext,
  scope: Schema.optional(ChatScope),
  fast: Schema.optional(Schema.Boolean),
  timeZone: Schema.optional(Schema.String),
});
export type RuthChatRequest = typeof RuthChatRequest.Type;
