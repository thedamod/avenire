import { describe, expect, it } from "@effect/vitest";
import {
  aggregateBy,
  meanReciprocalRank,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  scoreQuery,
} from "./metrics.ts";

describe("retrieval metrics", () => {
  const relevant = ["a", "c"];

  it("computes binary cutoff metrics", () => {
    expect(recallAtK(["b", "a", "x"], relevant, 2)).toBe(0.5);
    expect(precisionAtK(["b", "a", "x"], relevant, 2)).toBe(0.5);
    expect(meanReciprocalRank(["b", "a", "c"], relevant)).toBe(0.5);
    expect(ndcgAtK(["b", "a", "c"], relevant, 2)).toBeCloseTo(0.3868528072);
  });

  it("supports graded relevance and averages query groups", () => {
    expect(
      ndcgAtK(
        ["low", "high"],
        [
          { documentId: "high", grade: 2 },
          { documentId: "low", grade: 1 },
        ],
        2,
      ),
    ).toBeCloseTo(0.7967075809);
    const a = scoreQuery(["a"], ["a"]);
    const b = scoreQuery(["b"], ["a"]);
    expect(
      aggregateBy([
        { group: "keyword", metrics: a },
        { group: "keyword", metrics: b },
      ]),
    ).toEqual([
      {
        group: "keyword",
        count: 2,
        metrics: { recall: 0.5, precision: 0.05, mrr: 0.5, ndcg: 0.5 },
      },
    ]);
  });
});
