/**
 * Library - the user's sources and notes, organized into notebooks.
 *
 * A file can belong to several notebooks, so membership is a relation,
 * not a column on the file.
 */
import * as Schema from "effect/Schema";

import { CaptureOrigin, SourceAccess } from "./capture.ts";
import { CaptureId, FolderId, FileId, FileEventId, StorageKey } from "./ids.ts";

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

/** `inbox` until the user (or clustering) files it; `archived` hides it from the active library. */
export const FilePlacement = Schema.Literals(["inbox", "filed", "archived"]);
export type FilePlacement = typeof FilePlacement.Type;

/** Where the file entered the library. */
/** `user` = written in the note editor; `chat` = saved from a chat or an ephemeral answer. */
export const FileSource = Schema.Literals([
  "upload",
  "capture",
  "ruth",
  "ruth-cloud",
  "user",
  "chat",
]);
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
  origin: Schema.NullOr(CaptureOrigin),
  access: SourceAccess,
  storageKey: Schema.NullOr(StorageKey),
  mimeType: Schema.NullOr(Schema.String),
  sizeBytes: Schema.NullOr(Schema.Number),
  captureId: Schema.NullOr(CaptureId),
  folderIds: Schema.Array(FolderId),
  /** Seek position for media captured mid-playback. */
  mediaPositionSec: Schema.NullOr(Schema.Number),
  /** Plain-text opening of a note (about 200 chars) or a source's abstract; null when unknown. */
  preview: Schema.NullOr(Schema.String),
  /** When an archived file is deleted for good (archivedAt + 30 days, or sooner once purged). */
  purgeAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type LibraryFile = typeof LibraryFile.Type;

/** Notebook cover colour; the only saturated colour in the app. */
export const FolderColor = Schema.Literals([
  "blue",
  "pink",
  "green",
  "yellow",
  "purple",
  "orange",
  "teal",
  "gray",
]);
export type FolderColor = typeof FolderColor.Type;

/** Line-art glyph drawn on a notebook cover. */
export const FolderCover = Schema.Literals([
  "cradle",
  "globe",
  "compass",
  "flask",
  "book",
  "atom",
  "chart",
  "leaf",
  "none",
]);
export type FolderCover = typeof FolderCover.Type;

/** A notebook. Stored as a folder; files join it through `file_folder`. */
export const Folder = Schema.Struct({
  id: FolderId,
  name: Schema.String,
  /** Set when the name came from automatic clustering rather than the user. */
  suggested: Schema.Boolean,
  color: FolderColor,
  cover: FolderCover,
  /** Active files only: notes are `kind: "note"`, sources are every other kind. */
  fileCount: Schema.Number,
  noteCount: Schema.Number,
  sourceCount: Schema.Number,
  /** Archive time (ISO); null while active. Archived notebooks only appear in the trash. */
  archivedAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  /** Last change to the notebook or any of its files. */
  updatedAt: Schema.String,
});
export type Folder = typeof Folder.Type;

/** A note's markdown body. `revision` is opaque; send it back as `baseRevision` when saving. */
export const NoteContent = Schema.Struct({
  fileId: FileId,
  title: Schema.String,
  markdown: Schema.String,
  revision: Schema.String,
});
export type NoteContent = typeof NoteContent.Type;

/** A short-lived URL for a file's original bytes (PDF, video, image, web snapshot). */
export const FileContentUrl = Schema.Struct({
  url: Schema.String,
  mimeType: Schema.NullOr(Schema.String),
  expiresAt: Schema.String,
});
export type FileContentUrl = typeof FileContentUrl.Type;

export const TrashRef = Schema.Union([
  Schema.TaggedStruct("file", { id: FileId }),
  Schema.TaggedStruct("folder", { id: FolderId }),
]);
export type TrashRef = typeof TrashRef.Type;

/**
 * One row of the trash. Trashing a notebook also trashes the files that were only in that
 * notebook; they come back with it and are listed under it, not as separate rows.
 */
export const TrashEntry = Schema.Union([
  Schema.TaggedStruct("file", { file: LibraryFile, purgeAt: Schema.String }),
  Schema.TaggedStruct("folder", { folder: Folder, purgeAt: Schema.String }),
]);
export type TrashEntry = typeof TrashEntry.Type;
