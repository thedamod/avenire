import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decodeRemoteMetadata, metadataArguments, preferredCaptions } from "./remote.ts";

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

  it.effect("preserves signed direct audio URLs and omits playlist-only formats", () =>
    Effect.gen(function* () {
      const direct = "https://media.example/audio.m4a?signature=a%2Fb&expires=123";
      const metadata = yield* decodeRemoteMetadata(
        JSON.stringify({
          formats: [
            { url: direct, protocol: "https", acodec: "aac", vcodec: "none" },
            { url: "https://media.example/video.m3u8", protocol: "m3u8_native", acodec: "aac" },
            {
              url: "https://media.example/video.mpd",
              protocol: "http_dash_segments",
              acodec: "aac",
            },
          ],
        }),
      );
      expect(metadata.audioUrl).toBe(direct);
      const playlists = yield* decodeRemoteMetadata(
        JSON.stringify({
          formats: [{ url: "https://media.example/video.m3u8", protocol: "m3u8_native" }],
        }),
      );
      expect(playlists.audioUrl).toBeUndefined();
    }),
  );

  it("routes helper and verification traffic through the scoped proxy and disables ambient hooks", () => {
    const url = "https://video.example/watch?id=abc";
    const proxy = "http://127.0.0.1:12345";
    const args = metadataArguments(url, proxy);
    expect(args[args.indexOf("--proxy") + 1]).toBe(proxy);
    expect(args[args.indexOf("--geo-verification-proxy") + 1]).toBe(proxy);
    for (const flag of [
      "--ignore-config",
      "--no-config-locations",
      "--no-plugin-dirs",
      "--no-js-runtimes",
      "--no-remote-components",
      "--skip-download",
    ])
      expect(args).toContain(flag);
    expect(args[args.indexOf("--downloader") + 1]).toBe("native");
    expect(args.slice(-2)).toEqual(["--", url]);
  });
});
