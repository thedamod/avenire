import { describe, expect, it } from "@effect/vitest";

import { capPerItem, weightedRrf } from "./fusion.ts";

describe("weightedRrf", () => {
  it("combines lane weights, ranks and lane provenance", () => {
    const fused = weightedRrf([
      { lane: "semantic", weight: 1, ids: ["semantic-only", "both"] },
      { lane: "exact", weight: 1.5, ids: ["both", "exact-only"] },
    ]);
    expect(fused.map((entry) => entry.id)).toEqual(["both", "exact-only", "semantic-only"]);
    expect(fused[0]?.score).toBeCloseTo(1 / 62 + 1.5 / 61);
    expect(fused[0]?.lanes).toEqual(["semantic", "exact"]);
  });

  it("ignores duplicate ids within one lane", () => {
    expect(weightedRrf([{ lane: "lexical", weight: 1, ids: ["a", "a"] }])).toEqual([
      { id: "a", score: 1 / 61, lanes: ["lexical"] },
    ]);
  });
});

describe("capPerItem", () => {
  const itemOf = (id: string) => id.split(":")[0];
  it("keeps at most two chunks per item", () => {
    const ranked = ["a:1", "a:2", "a:3", "b:1"].map((id) => ({ id, score: 1 }));
    expect(capPerItem(ranked, itemOf, 10).map((entry) => entry.id)).toEqual(["a:1", "a:2", "b:1"]);
  });

  it("lets an entry that shares a slot with a kept sibling through for free", () => {
    const ranked = ["a:slide", "a:talk", "a:other", "a:more"].map((id) => ({ id, score: 1 }));
    const pairs = (x: { id: string }, y: { id: string }) =>
      [x.id, y.id].sort().join() === "a:slide,a:talk";
    expect(capPerItem(ranked, itemOf, 10, 2, pairs).map((entry) => entry.id)).toEqual([
      "a:slide",
      "a:talk",
      "a:other",
    ]);
  });
});
