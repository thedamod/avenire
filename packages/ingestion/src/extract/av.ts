/** Audio and video files: a timed transcript, plus slide sections for video. */
import type { CoverageStatus, ExtractionCoverage } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { failureAccess } from "./access.ts";
import { formatTimestamp } from "../chunk.ts";
import { parseCaptions } from "./captions.ts";
import { ImageDescriber } from "./describe.ts";
import { type Frame, MEDIA_LIMITS, MediaProcessor } from "./media.ts";
import { type RemoteMetadata, RemoteMedia } from "./remote.ts";
import { type Cue, groupCues, stitchCues } from "./transcript.ts";
import { TranscriptCache, type TranscriptScope } from "./transcript-cache.ts";
import { Transcriber } from "./transcribe.ts";
import {
  combineCoverage,
  type ExtractedDocument,
  type ExtractedSection,
  ExtractionError,
  SourceAccessError,
  type SourceInput,
} from "./types.ts";

/** Media is transcribed up to this long; anything longer is indexed as partial. */
const MAX_MEDIA_SEC = 6 * 3600;
/** Audio is sent to the transcriber in clips this long, overlapping so no word is cut. */
const CLIP_SEC = 600;
const CLIP_OVERLAP_SEC = 5;
/** Slide frames described per minute of video, and in total. */
const FRAMES_PER_MINUTE = 2;
const MAX_FRAMES = 120;
/** Transcript within this many seconds of a frame helps the vision model name it. */
const FRAME_CONTEXT_SEC = 30;
/** yt-dlp audio downloads are bounded independently of transcription duration. */
const MAX_REMOTE_AUDIO_BYTES = 500 * 1024 * 1024;
/** Keep the outline within a single normal chunk. */
const MAX_OUTLINE_CHARS = 1400;

type CoveragePart = ExtractionCoverage["parts"][number];

const coveragePart = (
  part: string,
  status: CoverageStatus,
  issues: ReadonlyArray<string>,
): CoveragePart => (issues.length ? { part, status, detail: issues.join("; ") } : { part, status });

/** Logs a failed step and turns it into a missing result, recorded in coverage. */
const orMissing =
  (what: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.tapError((error) => Effect.logWarning(`${what} failed`, error)),
      Effect.option,
    );

/** Optional media work may lose coverage, but must retain access evidence. */
const remoteOrMissing =
  (what: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.map(Option.some),
      Effect.catch((cause) => {
        const access = failureAccess(cause);
        return access === undefined
          ? Effect.as(Effect.logWarning(`${what} failed`, cause), Option.none<A>())
          : Effect.fail(new SourceAccessError({ access, cause }));
      }),
      Effect.mapError((cause) => new ExtractionError({ source: "remote-media", cause })),
    );

const nearbyText = (cues: ReadonlyArray<Cue>, atSec: number) =>
  cues
    .filter(
      (cue) => cue.startSec <= atSec + FRAME_CONTEXT_SEC && cue.endSec >= atSec - FRAME_CONTEXT_SEC,
    )
    .map((cue) => cue.text)
    .join(" ");

/**
 * Slide sections from described frames: visible text first, then the description.
 * A frame showing the same text as the slide before it is the same slide. Each slide
 * lasts until the next one starts.
 */
export const toSlides = (
  described: ReadonlyArray<{
    readonly frame: Frame;
    readonly text: string;
    readonly description: string;
  }>,
  durationSec: number,
): ReadonlyArray<ExtractedSection> => {
  const distinct = described.filter(
    ({ text }, index) => !text.trim() || text.trim() !== described[index - 1]?.text.trim(),
  );
  return distinct.flatMap(({ frame, text, description }, index) => {
    const content = [text.trim(), description.trim()].filter(Boolean).join("\n\n");
    const endSec = distinct[index + 1]?.frame.atSec ?? durationSec;
    return content
      ? [{ text: content, kind: "slide" as const, location: { startSec: frame.atSec, endSec } }]
      : [];
  });
};

export const outlineSection = (
  title: string,
  uploader: string | undefined,
  description: string | undefined,
  chapters: RemoteMetadata["chapters"],
  slides: ReadonlyArray<ExtractedSection>,
  sourceUrl?: string,
): ExtractedSection => {
  const lines = [title.trim() || "Untitled media"];
  if (uploader) lines.push(`Channel: ${uploader.trim()}`);
  else if (sourceUrl) lines.push(`Source: ${sourceUrl.slice(0, 160)}`);
  if (description) lines.push(description.trim().slice(0, 600));
  const entries = chapters.length
    ? chapters.map((chapter) => ({ atSec: chapter.startSec, heading: chapter.title }))
    : slides.map((slide) => ({
        atSec: slide.location.startSec ?? 0,
        heading: slide.text.split("\n")[0] ?? "Slide",
      }));
  let included = 0;
  for (const entry of entries) {
    const line = `[${formatTimestamp(entry.atSec)}] ${entry.heading.trim().slice(0, 90)}`;
    if (lines.join("\n").length + line.length + 1 > MAX_OUTLINE_CHARS) break;
    lines.push(line);
    included++;
  }
  if (included < entries.length) lines.push(`${entries.length - included} more chapters`);
  return { kind: "outline", text: lines.join("\n"), location: { startSec: 0, heading: "Outline" } };
};

export const transcribeAudio = Effect.fn("extractMedia.transcribe")(function* (
  bytes: Uint8Array,
  durationSec: number,
  scope?: TranscriptScope,
) {
  const media = yield* MediaProcessor;
  const transcriber = yield* Transcriber;
  const cache = yield* TranscriptCache;
  const clips = yield* media
    .audioSegments(bytes, {
      segmentSec: CLIP_SEC,
      overlapSec: CLIP_OVERLAP_SEC,
      maxSec: MAX_MEDIA_SEC,
    })
    .pipe(orMissing("Audio extraction"));
  if (Option.isNone(clips)) {
    return { cues: [], part: coveragePart("transcript", "none", ["Audio extraction failed"]) };
  }
  const transcribed = yield* Effect.forEach(
    clips.value,
    (clip) =>
      cache.lookup(transcriber.model, clip.bytes, scope).pipe(
        Effect.catchTag("TranscriptCacheError", (error) =>
          Effect.as(Effect.logWarning("Transcript cache lookup failed", { error }), undefined),
        ),
        Effect.flatMap((stored) =>
          stored === undefined
            ? transcriber
                .transcribe(clip.bytes, clip.mimeType)
                .pipe(
                  Effect.tap((segments) =>
                    cache
                      .store(transcriber.model, clip.bytes, segments, scope)
                      .pipe(
                        Effect.catchTag("TranscriptCacheError", (error) =>
                          Effect.logWarning("Transcript cache store failed", error),
                        ),
                      ),
                  ),
                )
            : Effect.succeed(stored),
        ),
        Effect.map((segments) =>
          segments.map(({ text, startSec, endSec }) => ({
            text,
            startSec: clip.offsetSec + startSec,
            endSec: clip.offsetSec + endSec,
          })),
        ),
        orMissing("Transcription"),
      ),
    { concurrency: 2 },
  );
  const failed = transcribed.filter(Option.isNone).length;
  const cues = stitchCues(transcribed.flatMap((clip) => Option.getOrElse(clip, () => [])));
  const issues = [
    ...(clips.value.length === 0 ? ["No audio track"] : []),
    ...(failed > 0 ? [`${failed} of ${clips.value.length} audio clips failed transcription`] : []),
    ...(durationSec > MAX_MEDIA_SEC ? [`Transcribed the first ${MAX_MEDIA_SEC} seconds`] : []),
    ...(cues.length === 0 && clips.value.length > 0 && failed === 0 ? ["No speech detected"] : []),
  ];
  const status = cues.length === 0 ? "none" : issues.length > 0 ? "partial" : "full";
  return { cues, part: coveragePart("transcript", status, ["speech to text", ...issues]) };
});

const describeSlides = Effect.fn("extractMedia.describeSlides")(function* (
  bytes: Uint8Array,
  durationSec: number,
  cues: ReadonlyArray<Cue>,
  title: string,
) {
  const media = yield* MediaProcessor;
  const describer = yield* ImageDescriber;
  const maxFrames = Math.min(
    MAX_FRAMES,
    Math.max(1, Math.ceil((durationSec / 60) * FRAMES_PER_MINUTE)),
  );
  const frames = yield* media.sceneFrames(bytes, { maxFrames }).pipe(orMissing("Scene extraction"));
  if (Option.isNone(frames)) {
    return { sections: [], part: coveragePart("slides", "none", ["Scene extraction failed"]) };
  }
  const described = yield* Effect.forEach(
    frames.value,
    (frame) =>
      describer
        .describe({
          image: frame.bytes,
          mimeType: frame.mimeType,
          context: `${title}\n${nearbyText(cues, frame.atSec)}`,
        })
        .pipe(
          Effect.map((description) => ({ frame, ...description })),
          orMissing("Frame description"),
        ),
    { concurrency: 3 },
  );
  const slides = toSlides(described.flatMap(Option.toArray), durationSec);
  const failed = described.filter(Option.isNone).length;
  const issues = [
    ...(slides.length > 0
      ? ["Representative slide frames sampled within a bounded scene interval"]
      : []),
    ...(durationSec > MEDIA_LIMITS.workSec
      ? [`Sampled the first ${MEDIA_LIMITS.workSec} seconds`]
      : []),
    ...(failed > 0
      ? [`Frame description failed for ${failed} of ${frames.value.length} frames`]
      : []),
    ...(frames.value.length >= maxFrames ? [`Slide frames capped at ${maxFrames}`] : []),
    ...(slides.length === 0 ? ["No searchable slides"] : []),
  ];
  const status = slides.length === 0 ? "none" : issues.length > 0 ? "partial" : "full";
  return { sections: slides, part: coveragePart("slides", status, issues) };
});

/** Timed transcript sections and, for video, independent slide sections. */
export const extractMedia = Effect.fn("extractMedia")(function* (
  bytes: Uint8Array,
  source: SourceInput,
) {
  const media = yield* MediaProcessor;
  const info = yield* media
    .probe(bytes)
    .pipe(Effect.mapError((cause) => new ExtractionError({ source: "media", cause })));
  const embedded =
    info.subtitleStreamIndex === undefined
      ? Option.none<ReadonlyArray<Cue>>()
      : yield* media.embeddedCaptions(bytes, info.subtitleStreamIndex).pipe(
          Effect.map((text) => parseCaptions(text)),
          orMissing("Embedded captions"),
        );
  const captionCues = Option.getOrElse(embedded, () => []);
  const speech =
    captionCues.length > 0
      ? captionedSpeech(captionCues, "embedded captions", info.durationSec)
      : yield* transcribeAudio(bytes, info.durationSec, source.transcriptScope);
  const transcript = groupCues(speech.cues);
  if (!info.hasVideo) {
    return {
      title: source.title,
      sections: [outlineSection(source.title, undefined, undefined, [], []), ...transcript],
      coverage: combineCoverage([speech.part]),
    } satisfies ExtractedDocument;
  }
  const slides = yield* describeSlides(bytes, info.durationSec, speech.cues, source.title);
  return {
    title: source.title,
    sections: [
      outlineSection(source.title, undefined, undefined, [], slides.sections),
      ...transcript,
      ...slides.sections,
    ],
    coverage: combineCoverage([speech.part, slides.part]),
  } satisfies ExtractedDocument;
});

const captionedSpeech = (cues: ReadonlyArray<Cue>, origin: string, durationSec: number) => {
  const truncated = durationSec > MAX_MEDIA_SEC;
  return {
    cues: cues.filter((cue) => cue.startSec < MAX_MEDIA_SEC),
    part: coveragePart("transcript", truncated ? "partial" : "full", [
      origin,
      ...(truncated ? [`Indexed the first ${MAX_MEDIA_SEC} seconds`] : []),
    ]),
  };
};

/** Captions in the language order a student most likely wants: English, then the source's own. */
const captionLanguages = (metadata: RemoteMetadata) => [
  "en",
  "en-US",
  "en-GB",
  ...metadata.subtitleLanguages,
  ...metadata.automaticCaptionLanguages,
];

/** URL media: the given or platform captions first, otherwise its audio downloaded and transcribed. */
export const extractRemoteMedia = Effect.fn("extractRemoteMedia")(function* (
  url: string,
  source: SourceInput,
  metadata: RemoteMetadata,
  youtubeCues: ReadonlyArray<Cue>,
) {
  const remote = yield* RemoteMedia;
  const media = yield* MediaProcessor;
  const knownDuration =
    metadata.durationSec ?? Math.max(0, ...youtubeCues.map((cue) => cue.endSec));
  const captions =
    youtubeCues.length > 0
      ? Option.none()
      : yield* remote
          .captions(url, metadata, captionLanguages(metadata))
          .pipe(remoteOrMissing("Platform captions"));
  const platform = Option.flatMap(captions, Option.fromUndefinedOr);

  const speech =
    youtubeCues.length > 0
      ? captionedSpeech(youtubeCues, "platform captions", knownDuration)
      : Option.isSome(platform)
        ? captionedSpeech(parseCaptions(platform.value.text), platform.value.kind, knownDuration)
        : yield* remote.audio(url, MAX_REMOTE_AUDIO_BYTES).pipe(
            Effect.flatMap((audio) =>
              Effect.flatMap(media.probe(audio), (info) =>
                transcribeAudio(
                  audio,
                  metadata.durationSec ?? info.durationSec,
                  source.transcriptScope,
                ),
              ),
            ),
            remoteOrMissing("Remote audio"),
            Effect.map(
              Option.getOrElse(() => ({
                cues: [],
                part: coveragePart("transcript", "none", ["No captions or transcribable audio"]),
              })),
            ),
          );

  const title = metadata.title ?? source.title;
  // Only the audio track is fetched for URLs, so there are no frames to describe.
  const slides = coveragePart("slides", "none", ["No video frames acquired from URL"]);
  return {
    title,
    sections: [
      outlineSection(title, metadata.uploader, metadata.description, metadata.chapters, [], url),
      ...groupCues(speech.cues),
    ],
    coverage: combineCoverage(source.kind === "audio" ? [speech.part] : [speech.part, slides]),
  } satisfies ExtractedDocument;
});
