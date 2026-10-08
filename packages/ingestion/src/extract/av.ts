/** Audio and video files: a timed transcript, plus slide sections for video. */
import type { CoverageStatus, ExtractionCoverage } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ImageDescriber } from "./describe.ts";
import { type Frame, MediaProcessor } from "./media.ts";
import { type Cue, groupCues, stitchCues } from "./transcript.ts";
import { Transcriber } from "./transcribe.ts";
import {
  combineCoverage,
  type ExtractedDocument,
  type ExtractedSection,
  ExtractionError,
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

const transcribe = Effect.fn("extractMedia.transcribe")(function* (
  bytes: Uint8Array,
  durationSec: number,
) {
  const media = yield* MediaProcessor;
  const transcriber = yield* Transcriber;
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
      transcriber.transcribe(clip.bytes, clip.mimeType).pipe(
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
  return { cues, part: coveragePart("transcript", status, issues) };
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
  const speech = yield* transcribe(bytes, info.durationSec);
  const transcript = groupCues(speech.cues);
  if (!info.hasVideo) {
    return {
      title: source.title,
      sections: transcript,
      coverage: combineCoverage([speech.part]),
    } satisfies ExtractedDocument;
  }
  const slides = yield* describeSlides(bytes, info.durationSec, speech.cues, source.title);
  return {
    title: source.title,
    sections: [...transcript, ...slides.sections],
    coverage: combineCoverage([speech.part, slides.part]),
  } satisfies ExtractedDocument;
});
