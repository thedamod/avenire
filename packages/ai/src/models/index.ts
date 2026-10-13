/** Call sites use Ruth names (`ruth-*`); this is the only module that names a provider or model id. */
import { SCREEN_PROFILES, type ScreenProfile } from "@avenire/cloud/screen";
import { createFireworks } from "@ai-sdk/fireworks";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { customProvider, type LanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export const RUTH_MODEL_NAMES = ["ruth-sprint", "ruth-core", "ruth-apex"] as const;
export type RuthModelName = (typeof RUTH_MODEL_NAMES)[number];
export const RUTH_DEFAULT_MODEL: RuthModelName = "ruth-core";
export const RUTH_FAST_MODEL: RuthModelName = "ruth-sprint";

export interface ModelCapabilities {
  readonly vision: boolean;
  /** Whether screenshots may ride inside tool results; otherwise they follow as a user message. */
  readonly toolResultImages: boolean;
  readonly screenProfile?: ScreenProfile;
  /** Reasoning effort for Ruth chat, for models that otherwise default to maximum thinking. */
  readonly reasoning?: "low";
}

const screen = (id: (typeof SCREEN_PROFILES)[number]["id"]) =>
  SCREEN_PROFILES.find((profile) => profile.id === id)!;

export const RUTH_MODEL_CAPABILITIES: Record<RuthModelName, ModelCapabilities> = {
  "ruth-sprint": {
    vision: true,
    toolResultImages: false,
    screenProfile: screen("normalized-1000"),
    reasoning: "low",
  },
  "ruth-core": { vision: true, toolResultImages: true, screenProfile: screen("pixels-1280x720") },
  "ruth-apex": { vision: true, toolResultImages: true, screenProfile: screen("pixels-1280x720") },
};

export class RuthModels extends Context.Service<
  RuthModels,
  {
    readonly languageModel: (name: RuthModelName) => LanguageModel;
    readonly capabilities: (name: RuthModelName) => ModelCapabilities;
    readonly maxImages: number;
  }
>()("avenire/ai/RuthModels") {}

export const RuthModelsLive = Layer.effect(
  RuthModels,
  Effect.gen(function* () {
    const openrouter = createOpenRouter({
      apiKey: Redacted.value(yield* Config.Redacted("OPENROUTER_API_KEY")),
    });
    const fireworks = createFireworks({
      apiKey: Redacted.value(yield* Config.Redacted("FIREWORKS_API_KEY")),
    });
    const options = { parallelToolCalls: false, usage: { include: true } };
    const languageModels: Record<RuthModelName, LanguageModel> = {
      "ruth-sprint": fireworks.chatModel("accounts/fireworks/models/glm-5p3-flash"),
      "ruth-core": openrouter.chat("anthropic/claude-sonnet-5.5", options),
      "ruth-apex": openrouter.chat("anthropic/claude-opus-5.5", options),
    };
    const ruth = customProvider({ languageModels });
    return RuthModels.of({
      languageModel: (name) => ruth.languageModel(name),
      capabilities: (name) => RUTH_MODEL_CAPABILITIES[name],
      maxImages: 3,
    });
  }),
);
