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

export const CoverageStatus = Schema.Literals(["full", "partial", "none"]);
export type CoverageStatus = typeof CoverageStatus.Type;

/**
 * How much of a source made it into the index, per part (`text`, `ocr`,
 * `transcript`, `slides`, `description`, ...). `partial` names what was lost, so a
 * capped or degraded extraction is never shown as a clean success.
 */
export const ExtractionCoverage = Schema.Struct({
  status: CoverageStatus,
  parts: Schema.Array(
    Schema.Struct({
      part: Schema.String,
      status: CoverageStatus,
      detail: Schema.optional(Schema.String),
    }),
  ),
});
export type ExtractionCoverage = typeof ExtractionCoverage.Type;

export const IngestionJob = Schema.Struct({
  id: IngestionJobId,
  itemId: ItemId,
  status: IngestionStatus,
  attempts: Schema.Number,
  error: Schema.NullOr(Schema.String),
  /** Set once extraction finishes. */
  coverage: Schema.NullOr(ExtractionCoverage),
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
  "outline",
  /** On-screen text of a lecture slide or video frame. */
  "slide",
  /** A figure, chart or image, as its description and any text in it. */
  "figure",
  "other",
]);
export type ChunkKind = typeof ChunkKind.Type;

/** Where in the source a chunk came from, so citations can jump straight there. */
export const ChunkLocation = Schema.Struct({
  page: Schema.optional(Schema.Number),
  slide: Schema.optional(Schema.Number),
  sheet: Schema.optional(Schema.String),
  startSec: Schema.optional(Schema.Number),
  endSec: Schema.optional(Schema.Number),
  heading: Schema.optional(Schema.String),
});
export type ChunkLocation = typeof ChunkLocation.Type;
