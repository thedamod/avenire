import * as Effect from "effect/Effect";
import { extractText } from "unpdf";

import { type ExtractedDocument, ExtractionError, fullCoverage } from "./types.ts";

export const extractPdf = (source: Uint8Array): Effect.Effect<ExtractedDocument, ExtractionError> =>
  Effect.tryPromise({
    try: () => extractText(source),
    catch: (cause) => new ExtractionError({ source: "pdf", cause }),
  }).pipe(
    Effect.map(({ text }) => ({
      sections: text.map((page, index) => ({ text: page, location: { page: index + 1 } })),
      coverage: fullCoverage("text"),
    })),
  );
