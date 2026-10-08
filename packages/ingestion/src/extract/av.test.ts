import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { extractMedia } from "./av.ts";
import { DescribeError, ImageDescriber, ImageDescriberTest } from "./describe.ts";
import { MediaProcessor } from "./media.ts";
import { TranscriberTest } from "./transcribe.ts";
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
    sceneFrames: Effect.fn("MediaProcessor.sceneFramesTest")(function* () {
      return yield* Effect.succeed([{ atSec: 30, bytes, mimeType: "image/jpeg" }]);
    }),
  }),
);

describe("extractMedia", () => {
  it.effect("keeps transcript and slide as separate timed sections", () =>
    Effect.gen(function* () {
      const document = yield* extractMedia(bytes, source);
      expect(document.sections).toEqual([
        { text: "test transcript", kind: "transcript", location: { startSec: 10, endSec: 11 } },
        {
          text: "test visible text\n\ntest image description",
          kind: "slide",
          location: { startSec: 30, endSec: 50 },
        },
      ]);
      expect(document.coverage.status).toBe("full");
    }).pipe(Effect.provide(Layer.mergeAll(media, TranscriberTest, ImageDescriberTest))),
  );

  it.effect("reports partial coverage when frame descriptions fail", () =>
    Effect.gen(function* () {
      const document = yield* extractMedia(bytes, source);
      expect(document.sections.map((section) => section.kind)).toEqual(["transcript"]);
      expect(document.coverage).toEqual({
        status: "partial",
        parts: [
          { part: "transcript", status: "full" },
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
});
