import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import { DefuddleClass } from "defuddle/node";
import { parseHTML } from "linkedom";
import type { ExtractedDocument } from "./types.ts";
import { ExtractionError } from "./types.ts";

const sectionsFromMarkdown = (markdown: string) => {
  const sections: Array<{ text: string; location: { heading?: string } }> = [];
  let heading: string | undefined;
  let content: Array<string> = [];
  const flush = () => {
    const text = content.join("\n").trim();
    if (text) sections.push({ text, location: heading ? { heading } : {} });
    content = [];
  };
  for (const line of markdown.split("\n")) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (match) {
      flush();
      heading = (match[2] ?? "").trim();
    } else content.push(line);
  }
  flush();
  return sections;
};

export const extractWeb = (
  url: string,
  source: Uint8Array | null,
): Effect.Effect<ExtractedDocument, ExtractionError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const html = source
      ? new TextDecoder().decode(source)
      : yield* Effect.gen(function* () {
          const client = yield* HttpClient.HttpClient;
          const response = yield* client
            .get(url)
            .pipe(Effect.mapError((cause) => new ExtractionError({ source: "web-fetch", cause })));
          return yield* response.text.pipe(
            Effect.mapError((cause) => new ExtractionError({ source: "web-body", cause })),
          );
        });
    return yield* Effect.try({
      try: () => {
        const { document } = parseHTML(html);
        const parsed = new DefuddleClass(document).parse();
        return {
          ...(parsed.title ? { title: parsed.title } : {}),
          sections: sectionsFromMarkdown(parsed.contentMarkdown ?? parsed.content),
        };
      },
      catch: (cause) => new ExtractionError({ source: "web-parse", cause }),
    });
  });
