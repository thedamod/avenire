/**
 * Model choices for Ruth. Interactive turns favour latency; the nightly Ruth Cloud
 * run favours depth. Each is a `LanguageModel` layer, provided locally to the
 * service that uses it so both can live in one process.
 */
import * as AnthropicClient from "@effect/ai-anthropic/AnthropicClient";
import * as AnthropicLanguageModel from "@effect/ai-anthropic/AnthropicLanguageModel";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";

export const RUTH_DEFAULT_MODEL = "claude-sonnet-5-5";
export const RUTH_CLOUD_DEFAULT_MODEL = "claude-opus-5-5";

const AnthropicClientLive = AnthropicClient.layerConfig({
  apiKey: Config.Redacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const modelLayer = (envVar: string, fallback: string) =>
  Layer.unwrap(
    Effect.map(Config.String(envVar).pipe(Config.withDefault(fallback)), (model) =>
      AnthropicLanguageModel.layer({ model }),
    ),
  ).pipe(Layer.provide(AnthropicClientLive));

/** The model behind interactive Ruth turns (`RUTH_MODEL`). */
export const RuthModelLive = modelLayer("RUTH_MODEL", RUTH_DEFAULT_MODEL);

/** The model behind nightly Ruth Cloud runs (`RUTH_CLOUD_MODEL`). */
export const RuthCloudModelLive = modelLayer("RUTH_CLOUD_MODEL", RUTH_CLOUD_DEFAULT_MODEL);
