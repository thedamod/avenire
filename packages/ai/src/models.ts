/**
 * Model choices for Ruth. Interactive turns favour latency (with a lighter "fast"
 * option the user can pick per request); the nightly Ruth Cloud run favours depth.
 * All three are AI SDK language models from one Anthropic provider.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export const RUTH_DEFAULT_MODEL = "claude-sonnet-5-5";
export const RUTH_FAST_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const RUTH_CLOUD_DEFAULT_MODEL = "claude-opus-5-5";

export class RuthModels extends Context.Service<
  RuthModels,
  {
    /** The model behind interactive Ruth turns (`RUTH_MODEL`). */
    readonly ruth: LanguageModel;
    /** The model behind interactive turns with Fast on (`RUTH_FAST_MODEL`). */
    readonly fast: LanguageModel;
    /** The model behind nightly Ruth Cloud runs (`RUTH_CLOUD_MODEL`). */
    readonly cloud: LanguageModel;
  }
>()("avenire/ai/RuthModels") {}

const modelId = (name: string, fallback: string) =>
  Config.String(name).pipe(Config.withDefault(fallback));

/** Reads `ANTHROPIC_API_KEY` and the model overrides. */
export const RuthModelsLive = Layer.effect(
  RuthModels,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("ANTHROPIC_API_KEY");
    const ids = yield* Config.all({
      ruth: modelId("RUTH_MODEL", RUTH_DEFAULT_MODEL),
      fast: modelId("RUTH_FAST_MODEL", RUTH_FAST_DEFAULT_MODEL),
      cloud: modelId("RUTH_CLOUD_MODEL", RUTH_CLOUD_DEFAULT_MODEL),
    });
    const anthropic = createAnthropic({ apiKey: Redacted.value(apiKey) });
    return RuthModels.of({
      ruth: anthropic(ids.ruth),
      fast: anthropic(ids.fast),
      cloud: anthropic(ids.cloud),
    });
  }),
);
