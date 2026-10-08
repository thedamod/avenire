import type { BenchmarkRunFile } from "./run-file.ts";
import { summarize } from "./run.ts";

type Query = BenchmarkRunFile["results"][number];

const zeroMetrics = (metrics: Readonly<Record<string, number | null>>) =>
  Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [key, value === null ? null : 0]),
  );

/** Reproduce the scorer's empty-ranking result without another retrieval call. */
export const rescoreQuery = (query: Query, threshold: number): Query => {
  if (query.error !== undefined || query.topRelevance === null || query.topRelevance >= threshold) {
    return query;
  }
  const evaluation = query.evaluation;
  return {
    ...query,
    abstained: true,
    returnedCount: 0,
    evaluation: {
      ...evaluation,
      averagePrecision: evaluation.averagePrecision === null ? null : 0,
      mrrAt10: evaluation.mrrAt10 === null ? null : 0,
      ndcgAtK: zeroMetrics(evaluation.ndcgAtK),
      precisionAtK: zeroMetrics(evaluation.precisionAtK),
      recallAtK: zeroMetrics(evaluation.recallAtK),
      requiredEvidenceSuccessAtK: zeroMetrics(evaluation.requiredEvidenceSuccessAtK),
      returnedCount: 0,
    },
  };
};

export const rescoreRun = (run: BenchmarkRunFile, threshold: number): BenchmarkRunFile => {
  if (run.config.minRelevance !== 0) {
    throw new Error("Offline rescoring requires a threshold-0 run");
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new Error("The calibrated threshold must be finite and nonnegative");
  }
  const results = run.results.map((query) => rescoreQuery(query, threshold));
  return {
    ...run,
    config: { ...run.config, minRelevance: threshold },
    summary: summarize(results),
    results,
  };
};
