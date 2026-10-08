import { describe, expect, it } from "@effect/vitest";

import { cleanCaptionText, groupCues, toTimedCues } from "./youtube.ts";

describe("cleanCaptionText", () => {
  it("decodes entities, removes cues, and preserves symbols and numbers", () => {
    expect(
      cleanCaptionText("<i>x</i> &amp;#39;A&amp;#x32;&amp;quot; &lt; 4 &gt; 2 [Music] (laughs)"),
    ).toBe("x 'A2\" < 4 > 2");
    expect(cleanCaptionText("[Applause] x equals 2 [Laughter] &amp; y")).toBe("x equals 2 & y");
    expect(cleanCaptionText("[Music]")).toBe("");
  });
});

describe("groupCues", () => {
  it("closes after a speech gap and overlaps the last ten seconds", () => {
    const sections = groupCues([
      { text: "first", startSec: 0, endSec: 20 },
      { text: "second", startSec: 20, endSec: 40 },
      { text: "third", startSec: 40, endSec: 48 },
      { text: "[Music]", startSec: 48, endSec: 50 },
      { text: "fourth", startSec: 50, endSec: 58 },
      { text: "fifth", startSec: 59, endSec: 63 },
    ]);
    expect(sections).toEqual([
      { text: "first second third", location: { startSec: 0, endSec: 48 }, kind: "transcript" },
      { text: "third fourth fifth", location: { startSec: 40, endSec: 63 }, kind: "transcript" },
    ]);
  });

  it("hard-closes at 60 seconds", () => {
    const sections = groupCues([
      { text: "one", startSec: 0, endSec: 30 },
      { text: "two", startSec: 30, endSec: 59 },
      { text: "three", startSec: 59, endSec: 63 },
    ]);
    expect(sections).toEqual([
      { text: "one two", location: { startSec: 0, endSec: 59 }, kind: "transcript" },
      { text: "three", location: { startSec: 59, endSec: 63 }, kind: "transcript" },
    ]);
  });
});

describe("toTimedCues", () => {
  it("accepts millisecond offsets from YouTube", () => {
    expect(toTimedCues([{ text: "2 &amp; 3", offset: 30_000, duration: 5_000 }])).toEqual([
      { text: "2 & 3", startSec: 30, endSec: 35 },
    ]);
  });
});
