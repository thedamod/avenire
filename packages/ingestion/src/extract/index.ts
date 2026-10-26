import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";
import * as Option from "effect/Option";

import { extractMedia, extractRemoteMedia } from "./av.ts";
import { extractCaptions } from "./captions.ts";
import type { ImageDescriber } from "./describe.ts";
import { extractImage } from "./image.ts";
import type { MediaProcessor } from "./media.ts";
import type { Ocr } from "./ocr.ts";
import { extractOffice } from "./office.ts";
import { extractPdf } from "./pdf.ts";
import { RemoteMedia } from "./remote.ts";
import { resolveFormat } from "./resolve.ts";
import { extractTextDocument } from "./text.ts";
import type { TranscriptCache } from "./transcript-cache.ts";
import type { Transcriber } from "./transcribe.ts";
import {
  type ExtractedDocument,
  ExtractionError,
  type SourceInput,
  storableDocument,
  UnsupportedSource,
} from "./types.ts";
import { extractWeb } from "./web.ts";
import { extractPublicDocument } from "./public-document.ts";
import { fetchYouTubeCues } from "./youtube.ts";

export type { ExtractedDocument, SourceInput } from "./types.ts";
export { ExtractionError, UnsupportedSource } from "./types.ts";

/** Services the extractors call: page fetches, OCR, speech to text, vision, ffmpeg, yt-dlp. */
export type ExtractionServices =
  | HttpClient.HttpClient
  | Ocr
  | Transcriber
  | TranscriptCache
  | ImageDescriber
  | MediaProcessor
  | RemoteMedia;

/** YouTube's caption endpoint is quick when it works; give up on it fast. */
const YOUTUBE_CAPTIONS_TIMEOUT = "30 seconds";

/** A media URL: cheap YouTube captions first, then yt-dlp metadata, captions or audio. */
const extractUrlMedia = Effect.fn("extractUrlMedia")(function* (
  url: string,
  source: SourceInput,
  youtube: boolean,
) {
  const remote = yield* RemoteMedia;
  const cues = youtube
    ? Option.getOrElse(
        yield* fetchYouTubeCues(url).pipe(Effect.timeout(YOUTUBE_CAPTIONS_TIMEOUT), Effect.option),
        () => [],
      )
    : [];
  const metadata = yield* remote.metadata(url).pipe(
    Effect.map(Option.some),
    Effect.catchTag("RemoteMediaError", (error) =>
      error.reason === "unsupported"
        ? Effect.succeed(Option.none())
        : Effect.fail(new ExtractionError({ source: "remote-metadata", cause: error })),
    ),
  );
  if (Option.isNone(metadata) && cues.length === 0) {
    return yield* new UnsupportedSource({
      kind: source.kind,
      reason:
        "The URL has no anonymously accessible supported video or audio. For private media, acquire the original on your device and upload it.",
    });
  }
  return yield* extractRemoteMedia(
    url,
    source,
    Option.getOrElse(metadata, () => ({
      chapters: [],
      subtitleLanguages: [],
      automaticCaptionLanguages: [],
    })),
    cues,
  );
});

/** Extracts a source with the extractor its bytes, MIME type and URL call for. */
export const extract = (
  source: SourceInput,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource, ExtractionServices> =>
  extractWith(source).pipe(
    Effect.map((document) =>
      storableDocument({
        ...document,
        access:
          document.access ??
          (source.acquisitionMode === "stored" ? (source.access ?? "open") : "open"),
      }),
    ),
  );

const extractWith = (
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
      case "captions":
        return Effect.succeed(extractCaptions(bytes, source));
      case "text":
        return Effect.succeed(extractTextDocument(bytes, source));
      case "html":
        return extractWeb(sourceUrl ?? "", bytes);
    }
  } else if (source.acquisitionMode !== "stored" && sourceUrl !== null) {
    if (format === "youtube") return extractUrlMedia(sourceUrl, source, true);
    if (format === "web") return extractPublicDocument(sourceUrl, source.kind);
    if (format === "remote") {
      const media = extractUrlMedia(sourceUrl, source, false);
      return source.kind === "web-page"
        ? media.pipe(
            Effect.catchTags({
              UnsupportedSource: () => extractPublicDocument(sourceUrl, source.kind),
            }),
          )
        : media;
    }
  }
  return Effect.fail(
    new UnsupportedSource({
      kind: source.kind,
      reason:
        source.acquisitionMode === "stored" && bytes === null
          ? "The stored original is unavailable. Upload the original bytes again from your device; its citation URL cannot replace it."
          : bytes === null
            ? "This source requires stored content or a supported URL"
            : "No extractor is available for this file format",
    }),
  );
};
