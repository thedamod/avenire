import { describe, expect, it } from "@effect/vitest";
import { cosineSimilarity, meanVector, runningMean } from "./cluster.ts";

describe("cluster vector helpers", () => {
  it("mean-pools vectors", () => expect(meanVector([[1, 3], [3, 5]])).toEqual([2, 4]));
  it("computes cosine similarity", () => expect(cosineSimilarity([1, 0], [0.8, 0.6])).toBeCloseTo(0.8));
  it("updates a centroid as a running mean", () => expect(runningMean([1, 3], 1, [3, 5])).toEqual([2, 4]));
});
