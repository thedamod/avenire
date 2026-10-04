import * as Schema from "effect/Schema";

export const UserId = Schema.NonEmptyString.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const CaptureId = Schema.NonEmptyString.pipe(Schema.brand("CaptureId"));
export type CaptureId = typeof CaptureId.Type;

export const ItemId = Schema.NonEmptyString.pipe(Schema.brand("ItemId"));
export type ItemId = typeof ItemId.Type;

export const ClusterId = Schema.NonEmptyString.pipe(Schema.brand("ClusterId"));
export type ClusterId = typeof ClusterId.Type;

export const CanvasNodeId = Schema.NonEmptyString.pipe(Schema.brand("CanvasNodeId"));
export type CanvasNodeId = typeof CanvasNodeId.Type;

export const IngestionJobId = Schema.NonEmptyString.pipe(Schema.brand("IngestionJobId"));
export type IngestionJobId = typeof IngestionJobId.Type;

export const ChunkId = Schema.NonEmptyString.pipe(Schema.brand("ChunkId"));
export type ChunkId = typeof ChunkId.Type;

export const ThreadId = Schema.NonEmptyString.pipe(Schema.brand("ThreadId"));
export type ThreadId = typeof ThreadId.Type;

export const MessageId = Schema.NonEmptyString.pipe(Schema.brand("MessageId"));
export type MessageId = typeof MessageId.Type;

export const CloudRunId = Schema.NonEmptyString.pipe(Schema.brand("CloudRunId"));
export type CloudRunId = typeof CloudRunId.Type;

export const ArtifactId = Schema.NonEmptyString.pipe(Schema.brand("ArtifactId"));
export type ArtifactId = typeof ArtifactId.Type;

/** Object key inside the user's storage bucket, e.g. `users/<id>/items/<id>/source.pdf`. */
export const StorageKey = Schema.NonEmptyString.pipe(Schema.brand("StorageKey"));
export type StorageKey = typeof StorageKey.Type;
