import { describe, expect, it } from "@effect/vitest";

import { cleanCaptionText, groupCues } from "./youtube.ts";

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
      { text: "first", offset: 0, duration: 20 },
      { text: "second", offset: 20, duration: 20 },
      { text: "third", offset: 40, duration: 8 },
      { text: "[Music]", offset: 48, duration: 2 },
      { text: "fourth", offset: 50, duration: 8 },
      { text: "fifth", offset: 59, duration: 4 },
    ]);
    expect(sections).toEqual([
      { text: "first second third", location: { startSec: 0, endSec: 48 }, kind: "transcript" },
      { text: "third fourth fifth", location: { startSec: 40, endSec: 63 }, kind: "transcript" },
    ]);
  });

  it("hard-closes at 60 seconds and accepts millisecond offsets", () => {
    const sections = groupCues([
      { text: "one", offset: 0, duration: 30_000 },
      { text: "two", offset: 30_000, duration: 29_000 },
      { text: "three", offset: 59_000, duration: 4_000 },
    ]);
    expect(sections).toEqual([
      { text: "one two", location: { startSec: 0, endSec: 59 }, kind: "transcript" },
      { text: "three", location: { startSec: 59, endSec: 63 }, kind: "transcript" },
    ]);
  });
});
