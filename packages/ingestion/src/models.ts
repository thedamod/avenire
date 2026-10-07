/**
 * Models the ingestion package calls during indexing and search. Call sites use
 * these names and never a provider or model id; ids change through
 * `INGESTION_MODEL_<NAME>` without code changes:
 *
 * - `ingest-graph`: entity and relation extraction from chunks
 * - `ingest-planner`: splitting multi-part questions into aspects for deep search
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export const INGESTION_MODEL_NAMES = ["ingest-graph", "ingest-planner"] as const;
export type IngestionModelName = (typeof INGESTION_MODEL_NAMES)[number];

export const INGESTION_MODEL_DEFAULTS: Record<IngestionModelName, string> = {
  "ingest-graph": "gemini-3.5-flash-lite",
  "ingest-planner": "gemini-3.5-flash-lite",
};

export class IngestionModels extends Context.Service<
  IngestionModels,
  { readonly languageModel: (name: IngestionModelName) => LanguageModel }
>()("avenire/ingestion/IngestionModels") {}

const envName = (name: IngestionModelName) =>
  `INGESTION_MODEL_${name.slice("ingest-".length).toUpperCase()}`;

/** Reads `GEMINI_API_KEY` and the `INGESTION_MODEL_*` overrides. */
export const IngestionModelsLive = Layer.effect(
  IngestionModels,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("GEMINI_API_KEY");
    const google = createGoogleGenerativeAI({ apiKey: Redacted.value(apiKey) });
    const ids = yield* Config.all(
      Object.fromEntries(
        INGESTION_MODEL_NAMES.map((name) => [
          name,
          Config.String(envName(name)).pipe(Config.withDefault(INGESTION_MODEL_DEFAULTS[name])),
        ]),
      ),
    );
    return IngestionModels.of({
      languageModel: (name) => google(ids[name] ?? INGESTION_MODEL_DEFAULTS[name]),
    });
  }),
);
