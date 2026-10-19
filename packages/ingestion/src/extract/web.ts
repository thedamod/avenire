import { DefuddleClass } from "defuddle/node";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import { parseHTML } from "linkedom";

import { type ExtractedDocument, ExtractionError, fullCoverage } from "./types.ts";
import { sectionsFromMarkdown } from "./markdown.ts";

const fetchHtml = (url: string) =>
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    const response = yield* client.get(url);
    return yield* response.text;
  }).pipe(Effect.mapError((cause) => new ExtractionError({ source: "web-fetch", cause })));

const parseHtml = (html: string) =>
  Effect.try({
    try: (): ExtractedDocument => {
      const { document } = parseHTML(html);
      const parsed = new DefuddleClass(document).parse();
      return {
        ...(parsed.title ? { title: parsed.title } : {}),
        sections: sectionsFromMarkdown(parsed.contentMarkdown ?? parsed.content),
        coverage: fullCoverage("text"),
      };
    },
    catch: (cause) => new ExtractionError({ source: "web-parse", cause }),
  });

/** Parses the stored page snapshot when there is one, otherwise fetches the URL. */
export const extractWeb = (
  url: string,
  source: Uint8Array | null,
): Effect.Effect<ExtractedDocument, ExtractionError, HttpClient.HttpClient> =>
  (source === null ? fetchHtml(url) : Effect.succeed(new TextDecoder().decode(source))).pipe(
    Effect.flatMap(parseHtml),
  );
