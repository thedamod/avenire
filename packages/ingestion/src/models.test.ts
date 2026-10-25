import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { IngestionModels, IngestionModelsLive } from "./models.ts";

it.effect("resolves Qwen graph extraction and vision without a Gemini key", () =>
  Effect.gen(function* () {
    const models = yield* IngestionModels;
    expect(models.languageModel("ingest-vision")).toMatchObject({
      provider: "groq.chat",
      modelId: "qwen/qwen3.8-27b",
    });
    expect(models.languageModel("ingest-graph")).toMatchObject({
      provider: "groq.chat",
      modelId: "qwen/qwen3.8-27b",
    });
  }).pipe(
    Effect.provide(IngestionModelsLive),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ GROQ_API_KEY: "test" }),
    ),
  ),
);
