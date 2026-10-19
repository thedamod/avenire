/**
 * Library - the user's material: inbox files, folders and the canvas that lays them out.
 *
 * A file can belong to several folders (the canvas draws the extra memberships
 * as links), so membership is a relation, not a column on the file.
 */
import * as Schema from "effect/Schema";

import { CanvasNodeId, CaptureId, FolderId, FileId, FileEventId, StorageKey } from "./ids.ts";

export const FileKind = Schema.Literals([
  "pdf",
  "document",
  "web-page",
  "video",
  "audio",
  "image",
  "note",
  "selection",
]);
export type FileKind = typeof FileKind.Type;

/** `inbox` until the user (or clustering) files it; `archived` hides it from the canvas. */
export const FilePlacement = Schema.Literals(["inbox", "filed", "archived"]);
export type FilePlacement = typeof FilePlacement.Type;

/** Where the file entered the library. */
export const FileSource = Schema.Literals(["upload", "capture", "ruth", "ruth-cloud"]);
export type FileSource = typeof FileSource.Type;

export const FileEventKind = Schema.Literals(["opened", "edited", "captured", "uploaded"]);
export type FileEventKind = typeof FileEventKind.Type;

export const FileEvent = Schema.Struct({
  id: FileEventId,
  fileId: FileId,
  kind: FileEventKind,
  /** Event time (ISO). */
  at: Schema.String,
});
export type FileEvent = typeof FileEvent.Type;

export const LibraryFile = Schema.Struct({
  id: FileId,
  kind: FileKind,
  title: Schema.String,
  placement: FilePlacement,
  source: FileSource,
  tags: Schema.Array(Schema.String),
  /** Last content change (ISO); null until the original content has changed. */
  contentModifiedAt: Schema.NullOr(Schema.String),
  /** Archive time (ISO); null while active. */
  archivedAt: Schema.NullOr(Schema.String),
  sourceUrl: Schema.NullOr(Schema.String),
  storageKey: Schema.NullOr(StorageKey),
  mimeType: Schema.NullOr(Schema.String),
  sizeBytes: Schema.NullOr(Schema.Number),
  captureId: Schema.NullOr(CaptureId),
  folderIds: Schema.Array(FolderId),
  /** Seek position for media captured mid-playback. */
  mediaPositionSec: Schema.NullOr(Schema.Number),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type LibraryFile = typeof LibraryFile.Type;

export const Folder = Schema.Struct({
  id: FolderId,
  name: Schema.String,
  /** Set when the name came from automatic clustering rather than the user. */
  suggested: Schema.Boolean,
  fileCount: Schema.Number,
  createdAt: Schema.String,
});
export type Folder = typeof Folder.Type;

export const CanvasNodeRef = Schema.Union([
  Schema.TaggedStruct("file", { fileId: FileId }),
  Schema.TaggedStruct("folder", { folderId: FolderId }),
  Schema.TaggedStruct("sketch", { strokes: Schema.Unknown }),
]);
export type CanvasNodeRef = typeof CanvasNodeRef.Type;

export const CanvasNode = Schema.Struct({
  id: CanvasNodeId,
  ref: CanvasNodeRef,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export type CanvasNode = typeof CanvasNode.Type;
