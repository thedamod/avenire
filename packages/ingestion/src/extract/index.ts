import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";

import type { ImageDescriber } from "./describe.ts";
import { extractImage } from "./image.ts";
import { extractMedia } from "./av.ts";
import type { MediaProcessor } from "./media.ts";
import type { Ocr } from "./ocr.ts";
import { extractOffice } from "./office.ts";
import { extractPdf } from "./pdf.ts";
import { resolveFormat } from "./resolve.ts";
import { extractTextDocument } from "./text.ts";
import type { Transcriber } from "./transcribe.ts";
import {
  type ExtractedDocument,
  type ExtractionError,
  type SourceInput,
  UnsupportedSource,
} from "./types.ts";
import { extractWeb } from "./web.ts";
import { extractYouTube } from "./youtube.ts";

export type { ExtractedDocument, SourceInput } from "./types.ts";
export { ExtractionError, UnsupportedSource } from "./types.ts";

/** Services the extractors call: page fetches, OCR, speech to text, vision, ffmpeg. */
export type ExtractionServices =
  | HttpClient.HttpClient
  | Ocr
  | Transcriber
  | ImageDescriber
  | MediaProcessor;

/** Extracts a source with the extractor its bytes, MIME type and URL call for. */
export const extract = (
  source: SourceInput,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource, ExtractionServices> => {
  const { bytes, sourceUrl } = source;
  const format = resolveFormat(source);
  if (bytes !== null) {
    switch (format) {
      case "pdf":
        return extractPdf(bytes);
      case "office":
        return extractOffice(source.mimeType, bytes);
      case "image":
        return extractImage(bytes, source);
      case "media":
        return extractMedia(bytes, source);
      case "text":
        return Effect.succeed(extractTextDocument(bytes, source));
      case "html":
        return extractWeb(sourceUrl ?? "", bytes);
    }
  } else if (sourceUrl !== null) {
    if (format === "youtube") return extractYouTube(sourceUrl);
    if (format === "web") return extractWeb(sourceUrl, null);
  }
  return Effect.fail(
    new UnsupportedSource({
      kind: source.kind,
      reason:
        bytes === null
          ? "This source requires stored content or a supported URL"
          : "No extractor is available for this file format",
    }),
  );
};
