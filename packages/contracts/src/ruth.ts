/**
 * Ruth - the study agent that explains concepts from the user's own material.
 *
 * Ruth streams typed parts. Anything that changes the user's files pauses on an
 * approval the user must grant; read-only work and sandboxed compute do not.
 */
import * as Schema from "effect/Schema";

import { ApprovalId, ArtifactId, ChunkId, ItemId, MessageId, ThreadId } from "./ids.ts";

export const Citation = Schema.Struct({
  chunkId: ChunkId,
  itemId: ItemId,
  label: Schema.String,
});
export type Citation = typeof Citation.Type;

export const MessagePart = Schema.Union([
  Schema.TaggedStruct("text", { text: Schema.String, citations: Schema.Array(Citation) }),
  Schema.TaggedStruct("widget", { title: Schema.String, html: Schema.String }),
  Schema.TaggedStruct("plot", { artifactId: ArtifactId, alt: Schema.String }),
  Schema.TaggedStruct("video", { artifactId: ArtifactId, title: Schema.String }),
  Schema.TaggedStruct("code", {
    language: Schema.Literal("python"),
    source: Schema.String,
    stdout: Schema.String,
  }),
  Schema.TaggedStruct("approval", { approvalId: ApprovalId }),
]);
export type MessagePart = typeof MessagePart.Type;

export const Message = Schema.Struct({
  id: MessageId,
  threadId: ThreadId,
  role: Schema.Literals(["user", "assistant"]),
  parts: Schema.Array(MessagePart),
  createdAt: Schema.String,
});
export type Message = typeof Message.Type;

export const FileAction = Schema.Union([
  Schema.TaggedStruct("move", { itemId: ItemId, toClusterId: Schema.String }),
  Schema.TaggedStruct("rename", { itemId: ItemId, title: Schema.String }),
  Schema.TaggedStruct("delete", { itemId: ItemId }),
  Schema.TaggedStruct("create-note", { title: Schema.String, markdown: Schema.String }),
]);
export type FileAction = typeof FileAction.Type;

export const ApprovalDecision = Schema.Literals(["approved", "rejected"]);
export type ApprovalDecision = typeof ApprovalDecision.Type;

export const Approval = Schema.Struct({
  id: ApprovalId,
  threadId: ThreadId,
  action: FileAction,
  status: Schema.Literals(["pending", "approved", "rejected"]),
  createdAt: Schema.String,
});
export type Approval = typeof Approval.Type;

/** Events streamed to a client while Ruth works on a turn. */
export const RuthEvent = Schema.Union([
  Schema.TaggedStruct("message-started", { messageId: MessageId }),
  Schema.TaggedStruct("text-delta", { messageId: MessageId, delta: Schema.String }),
  Schema.TaggedStruct("part", { messageId: MessageId, part: MessagePart }),
  Schema.TaggedStruct("approval-requested", { approval: Approval }),
  Schema.TaggedStruct("message-completed", { message: Message }),
]);
export type RuthEvent = typeof RuthEvent.Type;
