import type { BenchmarkRunFile } from "./run-file.ts";
import { summarize, V1_FINAL } from "./run.ts";

type Result = BenchmarkRunFile["results"][number];
type Artifact = BenchmarkRunFile["artifacts"][number];

const summarizeSplit = (results: ReadonlyArray<Result>) => ({
  all: summarize(results),
  test: summarize(results.filter((result) => result.split === "test")),
});

const summarizeArtifacts = (artifacts: ReadonlyArray<Artifact>) => {
  const sourceTypes = [...new Set(artifacts.map((artifact) => artifact.sourceType))].sort();
  return Object.fromEntries(
    sourceTypes.map((sourceType) => {
      const rows = artifacts.filter((artifact) => artifact.sourceType === sourceType);
      return [
        sourceType,
        {
          count: rows.length,
          statuses: {
            indexed: rows.filter((row) => row.status === "indexed").length,
            reused: rows.filter((row) => row.status === "reused").length,
            partial: rows.filter((row) => row.status === "partial").length,
            failed: rows.filter((row) => row.status === "failed").length,
          },
          coverage: {
            full: rows.filter((row) => row.coverage?.status === "full").length,
            partial: rows.filter((row) => row.coverage?.status === "partial").length,
            none: rows.filter((row) => row.coverage?.status === "none").length,
            unrecorded: rows.filter((row) => row.coverage === undefined).length,
          },
          wallMs: rows.reduce((total, row) => total + row.wallMs, 0),
        },
      ];
    }),
  );
};

export const summarizeFinalRun = (run: BenchmarkRunFile) => {
  const v1 = run.results.filter((result) => !result.id.startsWith("x-"));
  const extension = run.results.filter((result) => result.id.startsWith("x-"));
  const familiesFor = (results: ReadonlyArray<Result>) =>
    Object.fromEntries(
      [...new Set(results.map((result) => result.family))]
        .sort()
        .map((family) => [
          family,
          summarizeSplit(results.filter((result) => result.family === family)),
        ]),
    );
  return {
    source: {
      gitSha: run.gitSha,
      datasetVersion: run.datasetVersion,
      config: run.config,
      providerCalls: run.providerCalls,
      models: run.models,
      unrerankedQueries: run.results.filter((result) => result.unreranked).map(({ id }) => id),
    },
    overall: summarize(run.results),
    v1: summarizeSplit(v1),
    extension: summarizeSplit(extension),
    families: { v1: familiesFor(v1), extension: familiesFor(extension) },
    artifacts: run.artifacts,
    ingestionBySourceType: summarizeArtifacts(run.artifacts),
  };
};

export const summarizeFinal = (standard: BenchmarkRunFile, deep: BenchmarkRunFile) => {
  if (
    standard.config.dataset !== "all" ||
    standard.config.depth !== "standard" ||
    (deep.config.dataset !== "v1" && deep.config.dataset !== "all") ||
    deep.config.depth !== "deep" ||
    standard.config.split !== "all" ||
    deep.config.split !== "all"
  ) {
    throw new Error(
      "Final summary requires an all-query standard run and a v1 or all-query deep run",
    );
  }
  // Pinned v1 v0.3 has 84 queries; v2 extension 0.2 has 94.
  const standardV1 = standard.results.filter((result) => !result.id.startsWith("x-"));
  const standardExtension = standard.results.filter((result) => result.id.startsWith("x-"));
  const deepV1 = deep.results.filter((result) => !result.id.startsWith("x-"));
  if (standardV1.length !== 84 || standardExtension.length !== 94 || deepV1.length !== 84) {
    throw new Error(
      "Final summary requires all 84 v1 and 94 extension standard queries and all 84 v1 deep queries",
    );
  }
  if (
    standard.config.minRelevance !== deep.config.minRelevance ||
    standard.datasetHash !== deep.datasetHash ||
    standard.manifestHash !== deep.manifestHash
  ) {
    throw new Error(
      "Final summary requires the same threshold and pinned v1 contracts in both runs",
    );
  }
  const providerCallsTotal =
    standard.providerCalls === undefined || deep.providerCalls === undefined
      ? null
      : {
          embed: {
            requests: standard.providerCalls.embed.requests + deep.providerCalls.embed.requests,
            rateLimited:
              standard.providerCalls.embed.rateLimited + deep.providerCalls.embed.rateLimited,
            failed: standard.providerCalls.embed.failed + deep.providerCalls.embed.failed,
          },
          rerank: {
            requests: standard.providerCalls.rerank.requests + deep.providerCalls.rerank.requests,
            rateLimited:
              standard.providerCalls.rerank.rateLimited + deep.providerCalls.rerank.rateLimited,
            failed: standard.providerCalls.rerank.failed + deep.providerCalls.rerank.failed,
          },
        };
  return {
    schemaVersion: 1,
    publishedV1: V1_FINAL,
    providerCallsTotal,
    runs: {
      standard: summarizeFinalRun(standard),
      deep: summarizeFinalRun(deep),
    },
  };
};
