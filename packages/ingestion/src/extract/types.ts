import * as Schema from "effect/Schema";
import type { ChunkLocation } from "@avenire/contracts";

export type ExtractedDocument = {
  readonly title?: string;
  readonly sections: ReadonlyArray<{ readonly text: string; readonly location: ChunkLocation }>;
};

export class ExtractionError extends Schema.TaggedError<ExtractionError>()("ExtractionError", {
  source: Schema.String,
  cause: Schema.Defect(),
}) {}

export class UnsupportedSource extends Schema.TaggedError<UnsupportedSource>()("UnsupportedSource", {
  kind: Schema.String,
  reason: Schema.String,
}) {}
