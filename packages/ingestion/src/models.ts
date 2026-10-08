/**
 * Models the ingestion package calls during indexing and search. Call sites use
 * these names and never a provider or model id; ids (`<provider>:<model>`, provider
 * `groq` or `google`) change through `INGESTION_MODEL_<NAME>` without code changes:
 *
 * - `ingest-graph`: entity and relation extraction from chunks
 * - `ingest-planner`: splitting multi-part questions into aspects for deep search
 * - `ingest-vision`: searchable descriptions and visible text from images
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
 * Text work runs on Groq: measured 2026-10-08, gpt-oss-120b extracted richer graphs in
 * ~4.5 s per batch where gemini-3.5-flash-lite took 13-20 s, and gpt-oss-20b plans in
 * ~0.4 s against 8-15 s. Groq has no vision models, so vision stays on Gemini.
 */
const ModelId = Schema.Union([
  Schema.TemplateLiteral(["groq:", Schema.String]),
  Schema.TemplateLiteral(["google:", Schema.String]),
]);
type ModelId = typeof ModelId.Type;

export const INGESTION_MODEL_DEFAULTS: Record<IngestionModelName, ModelId> = {
  "ingest-graph": "groq:openai/gpt-oss-120b",
  "ingest-planner": "groq:openai/gpt-oss-20b",
  "ingest-vision": "google:gemini-3.5-flash-lite",
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

/** Reads `GROQ_API_KEY`, `GEMINI_API_KEY` and the `INGESTION_MODEL_*` overrides. */
export const IngestionModelsLive = Layer.effect(
  IngestionModels,
  Effect.gen(function* () {
    const groq = createGroq({ apiKey: Redacted.value(yield* Config.Redacted("GROQ_API_KEY")) });
    const google = createGoogleGenerativeAI({
      apiKey: Redacted.value(yield* Config.Redacted("GEMINI_API_KEY")),
    });
    const resolve = (id: ModelId): LanguageModel =>
      id.startsWith("groq:")
        ? wrapLanguageModel({ model: groq(id.slice("groq:".length)), middleware: lowReasoning })
        : google(id.slice("google:".length));
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
