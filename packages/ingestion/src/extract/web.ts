import { DefuddleClass } from "defuddle/node";
import * as Effect from "effect/Effect";
import { parseHTML } from "linkedom";

import { type ExtractedDocument, ExtractionError, fullCoverage } from "./types.ts";
import { htmlAccess } from "./access.ts";
import { sectionsFromMarkdown } from "./markdown.ts";

const parseHtml = (html: string) =>
  Effect.try({
    try: (): ExtractedDocument => {
      const { document } = parseHTML(html);
      const parsed = new DefuddleClass(document).parse();
      return {
        ...(parsed.title ? { title: parsed.title } : {}),
        sections: sectionsFromMarkdown(parsed.contentMarkdown ?? parsed.content),
        coverage: fullCoverage("text"),
        access: htmlAccess(html),
      };
    },
    catch: (cause) => new ExtractionError({ source: "web-parse", cause }),
  });

/** Parse an already acquired snapshot. A citation URL never authorizes another fetch. */
export const extractWeb = (
  _url: string,
  source: Uint8Array,
): Effect.Effect<ExtractedDocument, ExtractionError> => parseHtml(new TextDecoder().decode(source));
