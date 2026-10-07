import { describe, expect, it } from "@effect/vitest";

import { capPerItem, reciprocalRankFusion } from "./fusion.ts";

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

describe("capPerItem", () => {
  const itemOf = (id: string) => id.split(":")[0];

  it("keeps at most two chunks per item while preserving rank order", () => {
    const ranked = ["a:1", "a:2", "a:3", "b:1", "a:4", "c:1"].map((id, index) => ({
      id,
      score: 10 - index,
    }));
    expect(capPerItem(ranked, itemOf, 10).map((entry) => entry.id)).toEqual([
      "a:1",
      "a:2",
      "b:1",
      "c:1",
    ]);
  });

  it("stops at the limit and skips unresolved ids", () => {
    const ranked = ["x:1", "missing", "y:1", "z:1"].map((id) => ({ id, score: 1 }));
    expect(
      capPerItem(ranked, (id) => (id === "missing" ? undefined : itemOf(id)), 2).map(
        (entry) => entry.id,
      ),
    ).toEqual(["x:1", "y:1"]);
  });
});
