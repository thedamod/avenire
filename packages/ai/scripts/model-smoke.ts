/** One generateText call through the Ruth model registry: pnpm --filter @avenire/ai model:smoke [ruth-sprint|ruth-core|ruth-apex] */
import { generateText } from "ai";
import * as Effect from "effect/Effect";

import {
  type RuthModelName,
  RUTH_MODEL_NAMES,
  RuthModels,
  RuthModelsLive,
} from "../src/models/index.ts";

const name = (process.argv[2] ?? "ruth-sprint") as RuthModelName;
if (!RUTH_MODEL_NAMES.includes(name)) throw new Error(`Unknown model ${name}`);

const program = Effect.gen(function* () {
  const models = yield* RuthModels;
  const started = Date.now();
  const result = yield* Effect.promise(() =>
    generateText({
      model: models.languageModel(name),
      prompt: "With visualizatione explain how gradient descent finds a minimum",
    }),
  );
  return { result, ms: Date.now() - started, capabilities: models.capabilities(name) };
}).pipe(Effect.provide(RuthModelsLive));

const { result, ms, capabilities } = await Effect.runPromise(program);
process.stdout.write(
  `${name} -> ${result.response.modelId}\n` +
    `capabilities: ${JSON.stringify({ ...capabilities, screenProfile: capabilities.screenProfile?.id })}\n` +
    `finish: ${result.finishReason}, ${ms} ms, usage: ${JSON.stringify(result.usage)}\n\n${result.text}\n`,
);
