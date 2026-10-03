import type { ChunkLocation } from "@avenire/contracts";
import * as Schema from "effect/Schema";

export type ExtractedDocument = {
  readonly title?: string;
  readonly sections: ReadonlyArray<{ readonly text: string; readonly location: ChunkLocation }>;
};

export class ExtractionError extends Schema.TaggedError<ExtractionError>()("ExtractionError", {
  source: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Could not extract ${this.source}: ${detail}`;
  }
}

export class UnsupportedSource extends Schema.TaggedError<UnsupportedSource>()(
  "UnsupportedSource",
  {
    kind: Schema.String,
    reason: Schema.String,
  },
) {
  override get message(): string {
    return `Cannot ingest ${this.kind}: ${this.reason}`;
  }
}
