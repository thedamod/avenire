/**
 * Ruth's model registry. Call sites use `ruth-*` names and never a provider or
 * model id, so models change through `RUTH_MODEL_*` without code changes:
 *
 * - `ruth-sprint`: fast and cheap (chat with Fast on, summaries, routing)
 * - `ruth-core`: the default for interactive chat
 * - `ruth-apex`: strongest reasoning (hard analysis, long video plans)
 * - `ruth-agent`: tool-heavy loops (Ruth Cloud runs)
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { customProvider, type LanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export const RUTH_MODEL_NAMES = ["ruth-sprint", "ruth-core", "ruth-apex", "ruth-agent"] as const;
export type RuthModelName = (typeof RUTH_MODEL_NAMES)[number];

/** Underlying model ids; each is overridable with `RUTH_MODEL_<NAME>`, e.g. `RUTH_MODEL_CORE`. */
export const RUTH_MODEL_DEFAULTS: Record<RuthModelName, string> = {
  "ruth-sprint": "claude-haiku-4-5-20251001",
  "ruth-core": "claude-sonnet-5-5",
  "ruth-apex": "claude-opus-5-5",
  "ruth-agent": "claude-opus-5-5",
};

export const RUTH_DEFAULT_MODEL: RuthModelName = "ruth-core";
export const RUTH_FAST_MODEL: RuthModelName = "ruth-sprint";
export const RUTH_CLOUD_MODEL: RuthModelName = "ruth-agent";

export class RuthModels extends Context.Service<
  RuthModels,
  { readonly languageModel: (name: RuthModelName) => LanguageModel }
>()("avenire/ai/RuthModels") {}

const envName = (name: RuthModelName) => `RUTH_MODEL_${name.slice("ruth-".length).toUpperCase()}`;

/** Reads `ANTHROPIC_API_KEY` and the `RUTH_MODEL_*` overrides. */
export const RuthModelsLive = Layer.effect(
  RuthModels,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("ANTHROPIC_API_KEY");
    const anthropic = createAnthropic({ apiKey: Redacted.value(apiKey) });
    const ids = yield* Config.all(
      Object.fromEntries(
        RUTH_MODEL_NAMES.map((name) => [
          name,
          Config.String(envName(name)).pipe(Config.withDefault(RUTH_MODEL_DEFAULTS[name])),
        ]),
      ),
    );
    const languageModels = Object.fromEntries(
      Object.entries(ids).map(([name, id]) => [name, anthropic(id)]),
    );
    const ruth = customProvider({ languageModels });
    return RuthModels.of({ languageModel: (name) => ruth.languageModel(name) });
  }),
);
