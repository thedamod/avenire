import * as Effect from "effect/Effect";
import { extractText } from "unpdf";
import type { ExtractedDocument } from "./types.ts";
import { ExtractionError } from "./types.ts";

export const extractPdf = (source: Uint8Array): Effect.Effect<ExtractedDocument, ExtractionError> =>
  Effect.tryPromise({
    try: () => extractText(source),
    catch: (cause) => new ExtractionError({ source: "pdf", cause }),
  }).pipe(Effect.map(({ text }) => ({ sections: text.map((text, index) => ({ text, location: { page: index + 1 } })) })));
