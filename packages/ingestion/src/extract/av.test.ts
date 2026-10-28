import { FileId, UserId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Deferred from "effect/Deferred";

import { extractMedia, outlineSection, transcribeAudio } from "./av.ts";
import { DescribeError, ImageDescriber, ImageDescriberTest } from "./describe.ts";
import { MediaProcessor } from "./media.ts";
import { TranscriptCacheTest } from "./transcript-cache.ts";
import { Transcriber, TranscriberTest } from "./transcribe.ts";
import type { SourceInput } from "./types.ts";

const bytes = new Uint8Array([1, 2, 3]);
const source: SourceInput = {
  kind: "video",
  title: "Lecture",
  mimeType: "video/webm",
  sourceUrl: null,
  bytes,
};
const media = Layer.succeed(
  MediaProcessor,
  MediaProcessor.of({
    probe: Effect.fn("MediaProcessor.probeTest")(function* () {
      return yield* Effect.succeed({ durationSec: 50, hasVideo: true });
    }),
    audioSegments: Effect.fn("MediaProcessor.audioSegmentsTest")(function* () {
      return yield* Effect.succeed([{ offsetSec: 10, bytes, mimeType: "audio/mpeg" }]);
    }),
    embeddedCaptions: () => Effect.succeed(""),
    sceneFrames: Effect.fn("MediaProcessor.sceneFramesTest")(function* () {
      return yield* Effect.succeed([{ atSec: 30, bytes, mimeType: "image/jpeg" }]);
    }),
  }),
);

describe("extractMedia", () => {
  it.effect("publishes transcript coverage before optional slide descriptions", () =>
    Effect.gen(function* () {
      const document = yield* extractMedia(bytes, { ...source, enrichment: "deferred" });
      expect(document.sections.some((section) => section.kind === "transcript")).toBe(true);
      expect(document.sections.some((section) => section.kind === "slide")).toBe(false);
      expect(document.coverage.parts).toContainEqual({
        part: "slides",
        status: "partial",
        detail: "Enrichment pending: slide descriptions",
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(media, TranscriberTest, TranscriptCacheTest, ImageDescriberTest),
      ),
    ),
  );

  it.effect("starts transcription while the audio producer is still making clips", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let produced = 0;
      const processor = MediaProcessor.of({
        streamsAudio: true,
        probe: () => Effect.succeed({ durationSec: 1200, hasVideo: false }),
        embeddedCaptions: () => Effect.succeed(""),
        sceneFrames: () => Effect.succeed([]),
        audioSegments: (_source, options) =>
          Effect.gen(function* () {
            produced++;
            yield* options.onSegment!({ offsetSec: 0, bytes, mimeType: "audio/mpeg" });
            yield* Deferred.await(started);
            produced++;
            yield* options.onSegment!({ offsetSec: 600, bytes, mimeType: "audio/mpeg" });
            return [
              { offsetSec: 0, bytes: new Uint8Array(), mimeType: "audio/mpeg" },
              { offsetSec: 600, bytes: new Uint8Array(), mimeType: "audio/mpeg" },
            ];
          }),
      });
      const transcriber = Transcriber.of({
        model: "stream-test",
        transcribe: () =>
          Effect.gen(function* () {
            if (produced === 1) yield* Deferred.succeed(started, undefined);
            return [{ text: "Streaming speech", startSec: 0, endSec: 1 }];
          }),
      });
      const result = yield* transcribeAudio(bytes, 1200).pipe(
        Effect.provideService(MediaProcessor, processor),
        Effect.provideService(Transcriber, transcriber),
        Effect.provide(TranscriptCacheTest),
      );
      expect(produced).toBe(2);
      expect(result.cues.map((cue) => cue.startSec)).toEqual([0, 600]);
    }),
  );
  it.effect("reuses successful clips only within the owning source", () => {
    let calls = 0;
    const transcriber = Layer.succeed(
      Transcriber,
      Transcriber.of({
        model: "owned-cache-test",
        transcribe: () =>
          Effect.sync(() => {
            calls++;
            return [{ text: "42 x", startSec: 0, endSec: 1 }];
          }),
      }),
    );
    return Effect.gen(function* () {
      const scope = { userId: UserId.make("owner"), fileId: FileId.make("source") };
      yield* transcribeAudio(bytes, 50, scope);
      yield* transcribeAudio(bytes, 50, scope);
      expect(calls).toBe(1);
      yield* transcribeAudio(bytes, 50, { ...scope, fileId: FileId.make("other-source") });
      expect(calls).toBe(2);
      yield* transcribeAudio(bytes, 50);
      yield* transcribeAudio(bytes, 50);
      expect(calls).toBe(4);
    }).pipe(Effect.provide(Layer.mergeAll(media, transcriber, TranscriptCacheTest)));
  });

  it("formats a bounded outline from platform chapters", () => {
    const outline = outlineSection(
      "Lecture",
      "MIT",
      "A".repeat(700),
      [
        { title: "Vectors", startSec: 0, endSec: 600 },
        { title: "Linear maps", startSec: 600, endSec: 1200 },
      ],
      [],
    );
    expect(outline.kind).toBe("outline");
    expect(outline.location).toEqual({ startSec: 0, heading: "Outline" });
    expect(outline.text).toContain("Channel: MIT");
    expect(outline.text).toContain("[10:00] Linear maps");
    expect(outline.text).not.toContain("A".repeat(700));
  });

  it.effect("keeps transcript and slide as separate timed sections", () =>
    Effect.gen(function* () {
      const document = yield* extractMedia(bytes, source);
      expect(document.sections).toEqual([
        {
          text: "Lecture\n[0:30] test visible text",
          kind: "outline",
          location: { startSec: 0, heading: "Outline" },
        },
        { text: "test transcript", kind: "transcript", location: { startSec: 10, endSec: 11 } },
        {
          text: "test visible text\n\ntest image description",
          kind: "slide",
          location: { startSec: 30, endSec: 50 },
        },
      ]);
      expect(document.coverage.status).toBe("partial");
      expect(document.coverage.parts.find((part) => part.part === "slides")?.detail).toContain(
        "Representative slide frames",
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(media, TranscriberTest, ImageDescriberTest, TranscriptCacheTest),
      ),
    ),
  );

  it.effect("reports partial coverage when frame descriptions fail", () =>
    Effect.gen(function* () {
      const document = yield* extractMedia(bytes, source);
      expect(document.sections.map((section) => section.kind)).toEqual(["outline", "transcript"]);
      expect(document.coverage).toEqual({
        status: "partial",
        parts: [
          { part: "transcript", status: "full", detail: "speech to text" },
          {
            part: "slides",
            status: "none",
            detail: "Frame description failed for 1 of 1 frames; No searchable slides",
          },
        ],
      });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          media,
          TranscriberTest,
          TranscriptCacheTest,
          Layer.succeed(
            ImageDescriber,
            ImageDescriber.of({
              describe: Effect.fn("ImageDescriber.failTest")(function* () {
                return yield* new DescribeError({ cause: "test" });
              }),
            }),
          ),
        ),
      ),
    ),
  );

  it.effect("uses embedded subtitles without calling speech to text", () =>
    Effect.gen(function* () {
      let calls = 0;
      const captionsMedia = Layer.succeed(
        MediaProcessor,
        MediaProcessor.of({
          probe: () => Effect.succeed({ durationSec: 50, hasVideo: true, subtitleStreamIndex: 2 }),
          embeddedCaptions: () =>
            Effect.succeed("WEBVTT\n\n00:00:10.000 --> 00:00:12.000\nEmbedded words"),
          audioSegments: () => Effect.succeed([]),
          sceneFrames: () => Effect.succeed([]),
        }),
      );
      const transcriber = Layer.succeed(
        Transcriber,
        Transcriber.of({
          model: "test",
          transcribe: () =>
            Effect.sync(() => {
              calls++;
              return [];
            }),
        }),
      );
      const document = yield* extractMedia(bytes, source).pipe(
        Effect.provide(
          Layer.mergeAll(captionsMedia, transcriber, ImageDescriberTest, TranscriptCacheTest),
        ),
      );
      expect(calls).toBe(0);
      expect(document.sections.map((section) => section.kind)).toEqual(["outline", "transcript"]);
      expect(document.coverage.parts[0]?.detail).toBe("embedded captions");
    }),
  );
});
