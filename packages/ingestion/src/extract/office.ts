import * as Effect from "effect/Effect";
import { OfficeParser } from "officeparser";

import { isOfficeMime, mimeEssence } from "./resolve.ts";
import {
  type ExtractedDocument,
  ExtractionError,
  fullCoverage,
  UnsupportedSource,
} from "./types.ts";

export const extractOffice = (
  mimeType: string | null,
  source: Uint8Array,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource> => {
  const mime = mimeEssence(mimeType);
  if (mime === undefined || !isOfficeMime(mime)) {
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
    Effect.map(({ value }) => ({
      sections: value.trim() ? [{ text: value, location: {} }] : [],
      coverage: fullCoverage("text"),
    })),
  );
};
