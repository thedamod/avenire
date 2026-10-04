import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DatabaseLive } from "@avenire/database/client";
import { EmbedderLive, EmbedderTest } from "@avenire/ingestion/embed";
import { RetrievalLive } from "@avenire/ingestion/retrieval";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { formatTable, runBenchmark } from "./run.ts";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const embedderName = option("--embedder") ?? "test";
const jsonPath = option("--json");
if (embedderName !== "test" && embedderName !== "openai") {
  throw new Error("--embedder must be test or openai");
}
if (args.includes("--json") && !jsonPath) throw new Error("--json requires a file path");

const InfrastructureLive = Layer.mergeAll(DatabaseLive, NodeServices.layer);
// The benchmark seeds through Database and Embedder as well as searching through
// Retrieval, so those layers stay visible to the program (provideMerge, not provide).
const AppLive = RetrievalLive.pipe(
  Layer.provideMerge(embedderName === "test" ? EmbedderTest : EmbedderLive),
  Layer.provideMerge(InfrastructureLive),
);

const program = Effect.gen(function* () {
  const { seeded, results } = yield* runBenchmark;
  yield* Effect.logInfo(
    `Seeded ${seeded.documents} documents and ${seeded.chunks} chunks with ${seeded.model}`,
  );
  yield* Effect.logInfo(`\n${formatTable(results)}`);
  if (jsonPath) {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(jsonPath, `${JSON.stringify({ seeded, results }, null, 2)}\n`);
    yield* Effect.logInfo(`Wrote ${jsonPath}`);
  }
}).pipe(Effect.provide(AppLive));

NodeRuntime.runMain(program);
