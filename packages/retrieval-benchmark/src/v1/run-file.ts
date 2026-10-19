import { ExtractionCoverage } from "@avenire/contracts";
import * as Schema from "effect/Schema";

import type { ProviderCalls } from "./provider-calls.ts";

const Metric = Schema.NullOr(Schema.Number);
const MetricRecord = Schema.Record(Schema.String, Metric);

const Evaluation = Schema.Struct({
  averagePrecision: Metric,
  judgedRelevantCount: Schema.Number,
  mrrAt10: Metric,
  ndcgAtK: MetricRecord,
  precisionAtK: MetricRecord,
  recallAtK: MetricRecord,
  requiredEvidenceSuccessAtK: MetricRecord,
  returnedCount: Schema.Number,
  unanswerable: Schema.Boolean,
});

export const RunFile = Schema.Struct({
  gitSha: Schema.String,
  datasetHash: Schema.optionalKey(Schema.String),
  manifestHash: Schema.optionalKey(Schema.String),
  datasetVersion: Schema.optionalKey(Schema.String),
  config: Schema.Struct({
    dataset: Schema.Literals(["v1", "extension", "all"]),
    depth: Schema.Literals(["standard", "deep"]),
    split: Schema.Literals(["all", "development", "test"]),
    embedder: Schema.Literals(["live", "test"]),
    reranker: Schema.Literals(["live", "test"]),
    graph: Schema.Literals(["live", "test"]),
    planner: Schema.Literals(["live", "test"]),
    minRelevance: Schema.Number,
  }),
  materializedEvidence: Schema.optionalKey(Schema.Number),
  evidence: Schema.optionalKey(Schema.Number),
  providerCalls: Schema.optionalKey(
    Schema.Struct({
      embed: Schema.Struct({
        requests: Schema.Number,
        rateLimited: Schema.Number,
        failed: Schema.Number,
      }),
      rerank: Schema.Struct({
        requests: Schema.Number,
        rateLimited: Schema.Number,
        failed: Schema.Number,
      }),
    }),
  ),
  models: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  summary: Schema.optionalKey(Schema.Unknown),
  artifacts: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      sourceType: Schema.String,
      status: Schema.Literals(["indexed", "reused", "partial", "failed"]),
      coverage: Schema.optionalKey(ExtractionCoverage),
      chunks: Schema.optionalKey(Schema.Number),
      wallMs: Schema.Number,
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
  results: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      family: Schema.String,
      split: Schema.Literals(["development", "test"]),
      latencyMs: Schema.Number,
      abstained: Schema.Boolean,
      topRelevance: Metric,
      returnedCount: Schema.Number,
      missingEvidenceIds: Schema.Array(Schema.String),
      evaluation: Evaluation,
      error: Schema.optionalKey(Schema.String),
      unreranked: Schema.optionalKey(Schema.Literal(true)),
    }),
  ),
});

export type BenchmarkRunFile = typeof RunFile.Type;
export type { ProviderCalls };
