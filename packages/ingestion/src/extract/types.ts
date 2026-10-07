import type { ChunkKind, ChunkLocation, ExtractionCoverage, ItemKind } from "@avenire/contracts";
import * as Schema from "effect/Schema";

/** What an extractor needs to know about a source, independent of how it's stored. */
export interface SourceInput {
  readonly kind: ItemKind;
  readonly title: string;
  readonly mimeType: string | null;
  readonly sourceUrl: string | null;
  /** The stored original, when there is one. */
  readonly bytes: Uint8Array | null;
}

export interface ExtractedSection {
  readonly text: string;
  readonly location: ChunkLocation;
  /** Set when the extractor knows the role (a slide, a figure); otherwise inferred. */
  readonly kind?: ChunkKind;
}

export interface ExtractedDocument {
  readonly title?: string;
  readonly sections: ReadonlyArray<ExtractedSection>;
  readonly coverage: ExtractionCoverage;
}

/** Coverage for a document produced in full by one part, e.g. `fullCoverage("text")`. */
export const fullCoverage = (part: string): ExtractionCoverage => ({
  status: "full",
  parts: [{ part, status: "full" }],
});

/** Overall coverage from its parts: full only if every part is, none only if every part is. */
export const combineCoverage = (parts: ExtractionCoverage["parts"]): ExtractionCoverage => ({
  status: parts.every((part) => part.status === "full")
    ? "full"
    : parts.every((part) => part.status === "none")
      ? "none"
      : "partial",
  parts,
});

export class ExtractionError extends Schema.TaggedError<ExtractionError>()("ExtractionError", {
  source: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Could not extract ${this.source}`;
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
