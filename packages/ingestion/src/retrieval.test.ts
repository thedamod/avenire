import { describe, expect, it } from "@effect/vitest";

import { reciprocalRankFusion } from "./retrieval.ts";

describe("reciprocalRankFusion", () => {
  it("ranks an id found by both rankers above ids found by one", () => {
    const fused = reciprocalRankFusion([
      ["semantic-only", "both"],
      ["both", "lexical-only"],
    ]);
    expect(fused.map((entry) => entry.id)).toEqual(["both", "semantic-only", "lexical-only"]);
  });

  it("scores each appearance as 1 / (k + rank)", () => {
    const [only] = reciprocalRankFusion([["a"]], 60);
    expect(only?.score).toBeCloseTo(1 / 61);
  });

  it("returns nothing for empty rankings", () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
