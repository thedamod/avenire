import * as Effect from "effect/Effect";
import { OfficeParser } from "officeparser";
import type { ExtractedDocument } from "./types.ts";
import { ExtractionError, UnsupportedSource } from "./types.ts";

const officeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
]);

export const supportsOffice = (mimeType: string | null) => mimeType !== null && officeTypes.has((mimeType.split(";")[0] ?? "").trim().toLowerCase());

export const extractOffice = (mimeType: string | null, source: Uint8Array): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource> => {
  const mime = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (!mime || !officeTypes.has(mime)) return Effect.fail(new UnsupportedSource({ kind: "document", reason: `Unsupported office MIME type: ${mime ?? "missing"}` }));
  return Effect.tryPromise({
    try: async () => (await OfficeParser.parseOffice(source)).to("text"),
    catch: (cause) => new ExtractionError({ source: `office:${mime}`, cause }),
  }).pipe(Effect.map(({ value }) => ({ sections: value.trim() ? [{ text: value, location: {} }] : [] })));
};
