/**
 * Models the ingestion package calls during indexing and search. Call sites use
 * these names and never a provider or model id; ids (`<provider>:<model>`, provider
 * `groq`) change through `INGESTION_MODEL_<NAME>` without code changes:
 *
 * - `ingest-graph`: entity and relation extraction from chunks
 * - `ingest-planner`: splitting multi-part questions into aspects for deep search
 * - `ingest-vision`: searchable descriptions and visible text from images
 */
import { createGroq } from "@ai-sdk/groq";
import { defaultSettingsMiddleware, type LanguageModel, wrapLanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

export const INGESTION_MODEL_NAMES = ["ingest-graph", "ingest-planner", "ingest-vision"] as const;
export type IngestionModelName = (typeof INGESTION_MODEL_NAMES)[number];

/**
 * Graph extraction and vision use Qwen on Groq. The smaller gpt-oss model handles
 * search planning; its low reasoning setting is scoped to that model family.
 */
const ModelId = Schema.TemplateLiteral(["groq:", Schema.String]);
type ModelId = typeof ModelId.Type;

export const INGESTION_MODEL_DEFAULTS: Record<IngestionModelName, ModelId> = {
  "ingest-graph": "groq:qwen/qwen3.8-27b",
  "ingest-planner": "groq:openai/gpt-oss-20b",
  "ingest-vision": "groq:qwen/qwen3.8-27b",
};

/**
 * Retries for model calls made while indexing, on top of the AI SDK's quick ones.
 * Provider overloads ("high demand", 429) usually pass within a minute, and a
 * background job can wait; search-time calls don't use this.
 */
export const INGESTION_RETRY = { schedule: Schedule.exponential("5 seconds"), times: 3 } as const;

export class IngestionModels extends Context.Service<
  IngestionModels,
  { readonly languageModel: (name: IngestionModelName) => LanguageModel }
>()("avenire/ingestion/IngestionModels") {}

const envName = (name: IngestionModelName) =>
  `INGESTION_MODEL_${name.slice("ingest-".length).toUpperCase()}`;

/** gpt-oss reasons before answering; these tasks are extraction, so keep that short. */
const lowReasoning = defaultSettingsMiddleware({
  settings: { providerOptions: { groq: { reasoningEffort: "low" } } },
});

/** Reads `GROQ_API_KEY` and the `INGESTION_MODEL_*` overrides. */
export const IngestionModelsLive = Layer.effect(
  IngestionModels,
  Effect.gen(function* () {
    const groq = createGroq({ apiKey: Redacted.value(yield* Config.Redacted("GROQ_API_KEY")) });
    const resolve = (id: ModelId): LanguageModel =>
      id.includes("gpt-oss")
        ? wrapLanguageModel({ model: groq(id.slice("groq:".length)), middleware: lowReasoning })
        : groq(id.slice("groq:".length));
    const models = yield* Effect.forEach(INGESTION_MODEL_NAMES, (name) =>
      Config.schema(ModelId, envName(name)).pipe(
        Config.withDefault(INGESTION_MODEL_DEFAULTS[name]),
        Effect.map((id) => [name, resolve(id)] as const),
      ),
    );
    const byName = new Map(models);
    return IngestionModels.of({
      languageModel: (name) => byName.get(name) ?? resolve(INGESTION_MODEL_DEFAULTS[name]),
    });
  }),
);
