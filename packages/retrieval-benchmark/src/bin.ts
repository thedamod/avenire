import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DatabaseLive } from "@avenire/database/client";
import { EmbedderLive, EmbedderTest } from "@avenire/ingestion/embed";
import { GraphExtractorLive, GraphExtractorTest } from "@avenire/ingestion/graph/extract";
import { GraphIndexerLive } from "@avenire/ingestion/graph/indexer";
import { GraphSearchLive } from "@avenire/ingestion/graph/search";
import { ItemIndexerLive } from "@avenire/ingestion/indexer";
import { IngestionModelsLive } from "@avenire/ingestion/models";
import { SemanticCacheLive } from "@avenire/ingestion/retrieval/cache";
import { QueryPlannerLive, QueryPlannerTest } from "@avenire/ingestion/retrieval/planner";
import { RerankerLive, RerankerTest } from "@avenire/ingestion/retrieval/rerank";
import { RetrievalLive } from "@avenire/ingestion/retrieval";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { formatLatency, formatTable, runBenchmark } from "./run.ts";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const choice = <T extends string>(name: string, values: ReadonlyArray<T>, fallback: T): T => {
  const value = option(name) ?? fallback;
  const match = values.find((candidate) => candidate === value);
  if (match !== undefined) return match;
  throw new Error(`${name} must be ${values.join(" or ")}`);
};
const embedderName = choice("--embedder", ["test", "cohere"], "test");
const rerankerName = choice("--reranker", ["test", "cohere"], "test");
const graphName = choice("--graph", ["test", "gemini"], "test");
const plannerName = choice("--planner", ["test", "gemini"], "test");
const depth = choice("--depth", ["standard", "deep"], "standard");
const jsonPath = option("--json");
if (args.includes("--json") && !jsonPath) throw new Error("--json requires a file path");

const Providers = Layer.mergeAll(
  embedderName === "test" ? EmbedderTest : EmbedderLive,
  rerankerName === "test" ? RerankerTest : RerankerLive,
  graphName === "test"
    ? GraphExtractorTest
    : GraphExtractorLive.pipe(Layer.provide(IngestionModelsLive)),
  plannerName === "test"
    ? QueryPlannerTest
    : QueryPlannerLive.pipe(Layer.provide(IngestionModelsLive)),
);
const Infrastructure = Layer.mergeAll(DatabaseLive, NodeServices.layer, Providers);
// The benchmark seeds through Database, Embedder and ItemIndexer as well as searching
// through Retrieval, so every layer stays visible to the program (provideMerge).
const AppLive = Layer.mergeAll(ItemIndexerLive, RetrievalLive).pipe(
  Layer.provideMerge(Layer.mergeAll(GraphIndexerLive, GraphSearchLive, SemanticCacheLive)),
  Layer.provideMerge(Infrastructure),
);

const program = Effect.gen(function* () {
  const { seeded, results } = yield* runBenchmark(depth);
  yield* Effect.logInfo(
    `Seeded ${seeded.documents} documents and ${seeded.chunks} chunks with ${seeded.model}`,
  );
  yield* Effect.logInfo(`\n${formatTable(results)}\n${formatLatency(results)}`);
  if (jsonPath) {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(jsonPath, `${JSON.stringify({ seeded, results }, null, 2)}\n`);
    yield* Effect.logInfo(`Wrote ${jsonPath}`);
  }
}).pipe(Effect.provide(AppLive));

NodeRuntime.runMain(program);
