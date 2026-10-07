/**
 * Ingestion - turning a stored item into searchable chunks.
 *
 * Status is a strict state machine. Workers claim `queued` jobs; each stage
 * transition is persisted so a crashed worker resumes instead of duplicating work.
 */
import * as Schema from "effect/Schema";

import { IngestionJobId, ItemId } from "./ids.ts";

export const IngestionStatus = Schema.Literals([
  "queued",
  "extracting",
  "chunking",
  "embedding",
  "graphing",
  "clustering",
  "indexed",
  "paused",
  "failed",
  "cancelled",
]);
export type IngestionStatus = typeof IngestionStatus.Type;

export const TERMINAL_INGESTION_STATUSES: ReadonlyArray<IngestionStatus> = [
  "indexed",
  "failed",
  "cancelled",
];

export const IngestionJob = Schema.Struct({
  id: IngestionJobId,
  itemId: ItemId,
  status: IngestionStatus,
  attempts: Schema.Number,
  error: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type IngestionJob = typeof IngestionJob.Type;

/** Semantic role of a chunk, used to bias retrieval and Ruth's explanations. */
export const ChunkKind = Schema.Literals([
  "concept",
  "definition",
  "example",
  "proof",
  "derivation",
  "transcript",
  "other",
]);
export type ChunkKind = typeof ChunkKind.Type;

/** Where in the source a chunk came from, so citations can jump straight there. */
export const ChunkLocation = Schema.Struct({
  page: Schema.optional(Schema.Number),
  startSec: Schema.optional(Schema.Number),
  endSec: Schema.optional(Schema.Number),
  heading: Schema.optional(Schema.String),
});
export type ChunkLocation = typeof ChunkLocation.Type;
