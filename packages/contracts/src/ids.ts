import * as Schema from "effect/Schema";

export const UserId = Schema.NonEmptyString.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const CaptureId = Schema.NonEmptyString.pipe(Schema.brand("CaptureId"));
export type CaptureId = typeof CaptureId.Type;

export const FileId = Schema.NonEmptyString.pipe(Schema.brand("FileId"));
export type FileId = typeof FileId.Type;

export const FolderId = Schema.NonEmptyString.pipe(Schema.brand("FolderId"));
export type FolderId = typeof FolderId.Type;

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

export const AssetId = Schema.NonEmptyString.pipe(Schema.brand("AssetId"));
export type AssetId = typeof AssetId.Type;

/** Object key inside the user's storage bucket, e.g. `users/<id>/files/<id>/source.pdf`. */
export const StorageKey = Schema.NonEmptyString.pipe(Schema.brand("StorageKey"));
export type StorageKey = typeof StorageKey.Type;

export const CloudTaskId = Schema.NonEmptyString.pipe(Schema.brand("CloudTaskId"));
export type CloudTaskId = typeof CloudTaskId.Type;

export const PendingApprovalId = Schema.NonEmptyString.pipe(Schema.brand("PendingApprovalId"));
export type PendingApprovalId = typeof PendingApprovalId.Type;

export const HydrationId = Schema.NonEmptyString.pipe(Schema.brand("HydrationId"));
export type HydrationId = typeof HydrationId.Type;

export const FileEventId = Schema.NonEmptyString.pipe(Schema.brand("FileEventId"));
export type FileEventId = typeof FileEventId.Type;
