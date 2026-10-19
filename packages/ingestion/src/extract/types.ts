import { ChunkKind, ChunkLocation, ExtractionCoverage, type FileKind } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import type { TranscriptScope } from "./transcript-cache.ts";

/**
 * Bump when any extractor's output changes. Stored documents from older versions
 * are re-extracted on the next ingest; same-version ones are reused.
 */
export const EXTRACTOR_VERSION = 1;

/** What an extractor needs to know about a source, independent of how it's stored. */
export interface SourceInput {
  readonly kind: FileKind;
  readonly title: string;
  readonly mimeType: string | null;
  readonly sourceUrl: string | null;
  /** Stored originals never use sourceUrl for acquisition; it is citation provenance only.
   * The pipeline derives this from the persisted storageKey, independently of read success.
   * Omitted only by legacy callers, where non-null bytes still always win. */
  readonly acquisitionMode?: "stored" | "public-url";
  /** The stored original, when there is one. */
  readonly bytes: Uint8Array | null;
  readonly transcriptScope?: TranscriptScope;
}

export const ExtractedSection = Schema.Struct({
  text: Schema.String,
  location: ChunkLocation,
  /** Set when the extractor knows the role (a slide, a figure); otherwise inferred. */
  kind: Schema.optionalKey(ChunkKind),
});
export type ExtractedSection = typeof ExtractedSection.Type;

/** An extraction result; persisted per source hash so re-ingestion doesn't re-extract. */
export const ExtractedDocument = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  sections: Schema.Array(ExtractedSection),
  coverage: ExtractionCoverage,
});
export type ExtractedDocument = typeof ExtractedDocument.Type;

/**
 * Text Postgres can store: no NUL characters (pdf.js emits them for some fonts) and
 * no lone UTF-16 surrogates.
 */
export const storableText = (text: string): string => text.replaceAll("\u0000", "").toWellFormed();

/** `document` with every title and section made storable; empty sections dropped. */
export const storableDocument = (document: ExtractedDocument): ExtractedDocument => ({
  ...document,
  ...(document.title === undefined ? {} : { title: storableText(document.title) }),
  sections: document.sections.flatMap((section) => {
    const text = storableText(section.text);
    return text.trim() ? [{ ...section, text }] : [];
  }),
});

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
