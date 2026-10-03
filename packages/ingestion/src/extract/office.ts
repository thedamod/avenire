import * as Effect from "effect/Effect";
import { OfficeParser } from "officeparser";

import { type ExtractedDocument, ExtractionError, UnsupportedSource } from "./types.ts";

const OFFICE_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
]);

/** `"Application/PDF; charset=x"` -> `"application/pdf"`. */
const essence = (mimeType: string | null): string | undefined =>
  mimeType?.split(";")[0]?.trim().toLowerCase() || undefined;

export const supportsOffice = (mimeType: string | null): boolean => {
  const mime = essence(mimeType);
  return mime !== undefined && OFFICE_TYPES.has(mime);
};

export const extractOffice = (
  mimeType: string | null,
  source: Uint8Array,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource> => {
  const mime = essence(mimeType);
  if (mime === undefined || !OFFICE_TYPES.has(mime)) {
    return Effect.fail(
      new UnsupportedSource({
        kind: "document",
        reason: `Unsupported office MIME type: ${mime ?? "missing"}`,
      }),
    );
  }
  return Effect.tryPromise({
    try: async () => (await OfficeParser.parseOffice(source)).to("text"),
    catch: (cause) => new ExtractionError({ source: `office:${mime}`, cause }),
  }).pipe(
    Effect.map(({ value }) => ({ sections: value.trim() ? [{ text: value, location: {} }] : [] })),
  );
};
