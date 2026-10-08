import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DatabaseLive } from "@avenire/database/client";
import { EmbedderLive, EmbedderTest } from "@avenire/ingestion/embed";
import { ImageDescriberLive } from "@avenire/ingestion/extract/describe";
import { MediaProcessorLive } from "@avenire/ingestion/extract/media";
import { OcrLive } from "@avenire/ingestion/extract/ocr";
import { RemoteMediaLive } from "@avenire/ingestion/extract/remote";
import { TranscriberLive } from "@avenire/ingestion/extract/transcribe";
import { TranscriptCacheLive } from "@avenire/ingestion/extract/transcript-cache";
import { GraphExtractorLive, GraphExtractorTest } from "@avenire/ingestion/graph/extract";
import { GraphIndexerLive } from "@avenire/ingestion/graph/indexer";
import { GraphSearchLive } from "@avenire/ingestion/graph/search";
import { ItemIndexerLive } from "@avenire/ingestion/indexer";
import { IngestionModelsLive } from "@avenire/ingestion/models";
import { RetrievalLive } from "@avenire/ingestion/retrieval";
import { SemanticCacheLive } from "@avenire/ingestion/retrieval/cache";
import { QueryPlannerLive, QueryPlannerTest } from "@avenire/ingestion/retrieval/planner";
import { RerankerLive, RerankerTest } from "@avenire/ingestion/retrieval/rerank";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { dataRoot, defaultCorpusDir, readContracts } from "./corpus.ts";
import { type BenchmarkDataset, Dataset } from "./domain.ts";
import { formatReport, runV1Benchmark, summarize } from "./run.ts";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const choice = <T extends string>(name: string, values: ReadonlyArray<T>, fallback: T): T => {
  const value = option(name) ?? fallback;
  const match = values.find((candidate) => candidate === value);
  if (match === undefined) throw new Error(`${name} must be ${values.join(" | ")}`);
  return match;
};
const embedder = choice("--embedder", ["live", "test"], "live");
const reranker = choice("--reranker", ["live", "test"], "live");
const graph = choice("--graph", ["live", "test"], "live");
const planner = choice("--planner", ["live", "test"], "live");
const depth = choice("--depth", ["standard", "deep"], "standard");
const split = choice("--split", ["all", "development", "test"], "all");
/** `extension` adds v2's queries for thin v1 slices; `v1` is the like-for-like comparison. */
const datasetName = choice("--dataset", ["v1", "extension", "all"], "v1");
const corpusDir = resolve(option("--corpus-dir") ?? defaultCorpusDir);
const reingest = args.includes("--reingest");
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const Providers = Layer.mergeAll(
  embedder === "test" ? EmbedderTest : EmbedderLive,
  reranker === "test" ? RerankerTest : RerankerLive,
  graph === "test" ? GraphExtractorTest : GraphExtractorLive,
  planner === "test" ? QueryPlannerTest : QueryPlannerLive,
  OcrLive,
  ImageDescriberLive,
  TranscriberLive,
  TranscriptCacheLive,
  MediaProcessorLive,
  RemoteMediaLive,
).pipe(
  Layer.provideMerge(
    Layer.mergeAll(IngestionModelsLive, DatabaseLive, FetchHttpClient.layer, NodeServices.layer),
  ),
);
const AppLive = Layer.mergeAll(ItemIndexerLive, RetrievalLive).pipe(
  Layer.provideMerge(Layer.mergeAll(GraphIndexerLive, GraphSearchLive, SemanticCacheLive)),
  Layer.provideMerge(Providers),
);

const readExtension = async (): Promise<BenchmarkDataset> =>
  Schema.decodeUnknownSync(Dataset)(
    JSON.parse(await readFile(resolve(dataRoot, "../v2/extension.json"), "utf8")),
  );

const merge = (a: BenchmarkDataset, b: BenchmarkDataset): BenchmarkDataset => ({
  schemaVersion: 1,
  version: `${a.version ?? "?"}+${b.version ?? "?"}`,
  evidence: [...a.evidence, ...b.evidence],
  queries: [...a.queries, ...b.queries],
  judgments: [...a.judgments, ...b.judgments],
});

const program = Effect.gen(function* () {
  const contracts = yield* Effect.promise(() => readContracts());
  const dataset =
    datasetName === "v1"
      ? contracts.dataset
      : datasetName === "extension"
        ? yield* Effect.promise(readExtension)
        : merge(contracts.dataset, yield* Effect.promise(readExtension));
  const run = yield* runV1Benchmark({
    artifacts: contracts.manifest.artifacts,
    dataset,
    corpusDir,
    depth,
    split,
    reingest,
  });
  const path = resolve(
    corpusDir,
    "runs",
    `${datasetName}-${depth}-${yield* Clock.currentTimeMillis}.json`,
  );
  const record = {
    gitSha,
    datasetHash: contracts.datasetHash,
    manifestHash: contracts.manifestHash,
    datasetVersion: dataset.version,
    config: { dataset: datasetName, depth, split, embedder, reranker, graph, planner },
    summary: summarize(run.results),
    materializedEvidence: run.materializedEvidence,
    evidence: run.evidence,
    artifacts: run.artifacts,
    results: run.results,
  };
  yield* Effect.promise(async () => {
    await mkdir(resolve(corpusDir, "runs"), { recursive: true });
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);
  });
  yield* Effect.logInfo(`\n${formatReport(run.artifacts, run.results)}\nRun: ${path}`);
}).pipe(Effect.provide(AppLive));

NodeRuntime.runMain(program);
