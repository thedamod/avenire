import { describe, expect, it } from "@effect/vitest";

import type { BenchmarkRunFile } from "./run-file.ts";
import { rescoreRun } from "./rescore.ts";

const evaluation = {
  averagePrecision: 1,
  judgedRelevantCount: 1,
  mrrAt10: 1,
  ndcgAtK: { "ndcg@10": 1 },
  precisionAtK: { "p@10": 0.1 },
  recallAtK: { "recall@10": 1 },
  requiredEvidenceSuccessAtK: { "all-evidence@10": 1 },
  returnedCount: 1,
  unanswerable: false,
};

const run: BenchmarkRunFile = {
  gitSha: "fixture",
  config: {
    dataset: "v1",
    depth: "standard",
    split: "all",
    embedder: "live",
    reranker: "live",
    graph: "live",
    planner: "live",
    minRelevance: 0,
  },
  artifacts: [],
  results: [
    {
      id: "below",
      family: "direct-fact",
      split: "test",
      latencyMs: 123,
      abstained: false,
      topRelevance: 0.2,
      returnedCount: 1,
      missingEvidenceIds: [],
      evaluation,
    },
    {
      id: "equal",
      family: "direct-fact",
      split: "test",
      latencyMs: 456,
      abstained: false,
      topRelevance: 0.3,
      returnedCount: 1,
      missingEvidenceIds: [],
      evaluation,
    },
  ],
};

describe("offline abstention rescore", () => {
  it("empties hits below the threshold and keeps threshold equality and measured latency", () => {
    const output = rescoreRun(run, 0.3);
    const below = output.results[0];
    expect(below?.abstained).toBe(true);
    expect(below?.returnedCount).toBe(0);
    expect(below?.evaluation.mrrAt10).toBe(0);
    expect(below?.evaluation.ndcgAtK["ndcg@10"]).toBe(0);
    expect(below?.evaluation.requiredEvidenceSuccessAtK["all-evidence@10"]).toBe(0);
    expect(below?.topRelevance).toBe(0.2);
    expect(below?.latencyMs).toBe(123);
    expect(output.results[1]).toEqual(run.results[1]);
    expect(output.config.minRelevance).toBe(0.3);
  });

  it("preserves a degraded, unreranked result with no relevance score", () => {
    const first = run.results[0];
    if (first === undefined) throw new Error("Missing test query");
    const missing = {
      ...run,
      results: [{ ...first, topRelevance: null }],
    };
    expect(rescoreRun(missing, 0.3).results[0]).toEqual(missing.results[0]);
  });
});
