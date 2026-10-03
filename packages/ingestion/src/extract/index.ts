import type { ItemRow } from "@avenire/database/schema";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";

import { extractOffice, supportsOffice } from "./office.ts";
import { extractPdf } from "./pdf.ts";
import { extractTextDocument } from "./text.ts";
import { type ExtractedDocument, type ExtractionError, UnsupportedSource } from "./types.ts";
import { extractWeb } from "./web.ts";
import { extractYouTube, isYouTubeUrl } from "./youtube.ts";

export type { ExtractedDocument } from "./types.ts";
export { ExtractionError, UnsupportedSource } from "./types.ts";

/** Picks the extractor for an item from its kind, stored bytes and source URL. */
export const extract = (
  item: ItemRow,
  source: Uint8Array | null,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource, HttpClient.HttpClient> => {
  if (item.kind === "pdf" && source) return extractPdf(source);
  if (item.kind === "document" && source && supportsOffice(item.mimeType)) {
    return extractOffice(item.mimeType, source);
  }
  if ((item.kind === "web-page" || item.kind === "video") && item.sourceUrl) {
    if (isYouTubeUrl(item.sourceUrl)) return extractYouTube(item.sourceUrl);
    if (item.kind === "web-page") return extractWeb(item.sourceUrl, source);
  }
  if ((item.kind === "note" || item.kind === "selection") && source) {
    return Effect.succeed(extractTextDocument(source, item.title));
  }
  return Effect.fail(
    new UnsupportedSource({
      kind: item.kind,
      reason:
        source === null
          ? "This source requires stored content or a supported URL"
          : "No extractor is available for this item format",
    }),
  );
};
