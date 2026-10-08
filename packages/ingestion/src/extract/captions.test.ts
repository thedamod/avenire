import { describe, expect, it } from "@effect/vitest";

import { extractCaptions, parseCaptions } from "./captions.ts";
import { stitchCues } from "./transcript.ts";
import type { SourceInput } from "./types.ts";

const source: SourceInput = {
  kind: "video",
  title: "Lecture",
  mimeType: "text/vtt",
  sourceUrl: null,
  bytes: null,
};

describe("caption extraction", () => {
  it("parses SRT timestamps and decodes text without losing numbers", () => {
    const bytes = new TextEncoder().encode(
      "1\n00:00:01,250 --> 00:00:03,500\n<i>x</i> = 2 &amp; 3\n\n2\n00:00:05,000 --> 00:00:06,000\n[Music] a is 1",
    );
    const result = extractCaptions(bytes, source);
    expect(result.coverage.status).toBe("full");
    expect(result.sections).toEqual([
      { text: "x = 2 & 3 a is 1", kind: "transcript", location: { startSec: 1.25, endSec: 6 } },
    ]);
  });

  it("parses WebVTT cue identifiers and settings", () => {
    const vtt =
      "WEBVTT\n\ncue-1\n00:01.000 --> 00:03.000 align:start\n<v Speaker>vector &amp; matrix</v>\n\n00:04.000 --> 00:05.000\n2 × 3";
    expect(parseCaptions(vtt)).toEqual([
      { text: "<v Speaker>vector &amp; matrix</v>", startSec: 1, endSec: 3 },
      { text: "2 × 3", startSec: 4, endSec: 5 },
    ]);
    expect(extractCaptions(new TextEncoder().encode(vtt), source).sections[0]?.text).toBe(
      "vector & matrix 2 × 3",
    );
  });

  it("removes only repeated boundary words", () => {
    expect(
      stitchCues([
        { text: "x equals 2", startSec: 0, endSec: 5 },
        { text: "2 plus 1", startSec: 4, endSec: 8 },
      ]),
    ).toEqual([
      { text: "x equals 2", startSec: 0, endSec: 5 },
      { text: "plus 1", startSec: 4, endSec: 8 },
    ]);
  });
});
