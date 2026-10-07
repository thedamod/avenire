import { describe, expect, it } from "@effect/vitest";

import { advanceFrontier, type GraphEdge, mergeSeeds, rankGraph } from "./rank.ts";

const edge = (id: string, sourceId: string, targetId: string, chunkId: string): GraphEdge => ({
  id,
  sourceId,
  targetId,
  chunkId,
  itemId: "item",
  sourceName: sourceId,
  targetName: targetId,
  predicate: "leads to",
  weight: 1,
});

describe("rankGraph", () => {
  it("ranks a two-hop bridge above a chunk mentioning one seed", () => {
    const hops = [[edge("ab", "A", "B", "first-hop")], [edge("bc", "B", "C", "second-hop")]];
    let scores: ReadonlyMap<string, number> = new Map([["A", 1]]);
    let frontier: ReadonlyArray<string> = ["A"];
    for (const edges of hops) ({ scores, frontier } = advanceFrontier(scores, frontier, edges));
    expect(scores.get("C")).toBe(0.25);

    const result = rankGraph(
      scores,
      hops.flat(),
      [
        { entityId: "A", chunkId: "single" },
        { entityId: "B", chunkId: "second-hop" },
        { entityId: "C", chunkId: "second-hop" },
      ],
      3,
    );
    expect(result.chunkIds.indexOf("second-hop")).toBeLessThan(result.chunkIds.indexOf("single"));
    expect(result.facts.map((fact) => fact.id)).toEqual(["ab", "bc"]);
  });
});

describe("mergeSeeds", () => {
  it("keeps each entity's best score, best first", () => {
    const seeds = mergeSeeds(
      [
        { id: "a", score: 0.6 },
        { id: "b", score: 0.9 },
        { id: "a", score: 1 },
      ],
      10,
    );
    expect(seeds).toEqual([
      { id: "a", score: 1 },
      { id: "b", score: 0.9 },
    ]);
  });
});
