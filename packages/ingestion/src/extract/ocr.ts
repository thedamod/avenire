/** Optical character recognition for scanned PDF pages and images (Mistral OCR). */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class OcrError extends Schema.TaggedError<OcrError>()("OcrError", {
  pages: Schema.Number,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `OCR of ${this.pages} page(s) failed`;
  }
}

export interface OcrPage {
  /** 1-based page number in the source document. */
  readonly page: number;
  /** Page text as Markdown, tables included, with figure descriptions inline. */
  readonly markdown: string;
}

export class Ocr extends Context.Service<
  Ocr,
  {
    readonly model: string;
    /** OCR of the given 1-based pages of a PDF (all pages when omitted). */
    readonly pdf: (
      bytes: Uint8Array,
      pages?: ReadonlyArray<number>,
    ) => Effect.Effect<ReadonlyArray<OcrPage>, OcrError>;
    readonly image: (bytes: Uint8Array, mimeType: string) => Effect.Effect<string, OcrError>;
  }
>()("avenire/ingestion/Ocr") {}
