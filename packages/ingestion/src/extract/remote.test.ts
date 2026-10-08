import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeRemoteMetadata, preferredCaptions } from "./remote.ts";

describe("remote media metadata", () => {
  it.effect("decodes chapters and both subtitle language lists", () =>
    Effect.gen(function* () {
      const metadata = yield* decodeRemoteMetadata(
        JSON.stringify({
          title: "Linear Algebra Lecture",
          duration: 3600,
          uploader: "MIT",
          channel: "MIT OpenCourseWare",
          description: "Matrices and vector spaces",
          chapters: [{ title: "Basis", start_time: 0, end_time: 600 }],
          subtitles: { en: [{ ext: "vtt" }], fr: [] },
          automatic_captions: { "en-US": [], de: [] },
        }),
      );
      expect(metadata).toEqual({
        title: "Linear Algebra Lecture",
        durationSec: 3600,
        uploader: "MIT OpenCourseWare",
        description: "Matrices and vector spaces",
        chapters: [{ title: "Basis", startSec: 0, endSec: 600 }],
        subtitleLanguages: ["en", "fr"],
        automaticCaptionLanguages: ["en-US", "de"],
      });
    }),
  );

  it.effect("rejects malformed metadata", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(decodeRemoteMetadata('{"duration":"many"}'));
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("accepts chapters whose end time is omitted by the platform", () =>
    Effect.gen(function* () {
      const metadata = yield* decodeRemoteMetadata(
        '{"chapters":[{"title":"Closing","start_time":50,"end_time":null}]}',
      );
      expect(metadata.chapters).toEqual([{ title: "Closing", startSec: 50, endSec: 50 }]);
    }),
  );

  it("honors language order and prefers manual captions for the same language", () => {
    const metadata = {
      chapters: [],
      subtitleLanguages: ["en", "fr"],
      automaticCaptionLanguages: ["en", "de"],
    };
    expect(preferredCaptions(metadata, ["de", "en"])).toEqual({
      language: "de",
      kind: "auto captions",
    });
    expect(preferredCaptions(metadata, ["en", "de"])).toEqual({
      language: "en",
      kind: "platform captions",
    });
    expect(preferredCaptions(metadata, ["es"])).toBeUndefined();
  });
});
