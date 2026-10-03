import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { DatabaseLive } from "@avenire/database/client";
import { EmbedderLive, EmbedderTest } from "@avenire/ingestion/embed";
import { RetrievalLive } from "@avenire/ingestion/retrieval";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { writeFile } from "node:fs/promises";
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

const embedderLayer = embedderName === "test" ? EmbedderTest : EmbedderLive;
const InfrastructureLive = Layer.mergeAll(
  DatabaseLive,
  NodeServices.layer,
  NodeHttpClient.layerNodeHttp,
);
const WithEmbedderLive = embedderLayer.pipe(Layer.provideMerge(InfrastructureLive));
const AppLive = RetrievalLive.pipe(Layer.provideMerge(WithEmbedderLive));

const program = runBenchmark.pipe(
  Effect.flatMap(({ seeded, results }) =>
    Effect.gen(function* () {
      yield* Effect.logInfo(
        `Seeded ${seeded.documents} documents and ${seeded.chunks} chunks with ${seeded.model}`,
      );
      yield* Effect.logInfo(`\n${formatTable(results)}`);
      if (jsonPath) {
        yield* Effect.tryPromise(() =>
          writeFile(jsonPath, `${JSON.stringify({ seeded, results }, null, 2)}\n`, "utf8"),
        );
        yield* Effect.logInfo(`Wrote ${jsonPath}`);
      }
    }),
  ),
  Effect.provide(AppLive),
);

NodeRuntime.runMain(program);
