import { SCREEN_PROFILES } from "@avenire/cloud/screen";

/** Call sites resolve Ruth registry names; only this module knows provider model ids. */
import { createFireworks } from "@ai-sdk/fireworks";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { customProvider, type LanguageModel } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export const RUTH_MODEL_NAMES = ["ruth-sprint", "ruth-core", "ruth-apex"] as const;
export type RuthModelName = (typeof RUTH_MODEL_NAMES)[number];
/** A `fireworks:` prefix routes to Fireworks; any other id is an OpenRouter model id. */
export const RUTH_MODEL_DEFAULTS: Record<RuthModelName, string> = {
  "ruth-sprint": "fireworks:accounts/fireworks/models/glm-5p3-flash",
  "ruth-core": "anthropic/claude-sonnet-5.5",
  "ruth-apex": "anthropic/claude-opus-5.5",
};
export const RUTH_DEFAULT_MODEL: RuthModelName = "ruth-core";
export const RUTH_FAST_MODEL: RuthModelName = "ruth-sprint";
const FIREWORKS_PREFIX = "fireworks:";
export const parseModelId = (spec: string) =>
  spec.startsWith(FIREWORKS_PREFIX)
    ? { provider: "fireworks" as const, id: spec.slice(FIREWORKS_PREFIX.length) }
    : { provider: "openrouter" as const, id: spec };
export const screenProfileForModel = (
  id: string,
): import("@avenire/cloud/screen").ScreenProfile => {
  // GLM-V grounding is documented on a 0-1000 grid; unverified until the conformance run.
  const profile = /(?:gemini)/i.test(id)
    ? "normalized-999"
    : /qwen3.*vl|glm/i.test(id)
      ? "normalized-1000"
      : /^openai\/.*(?:computer-use|cua)/i.test(id)
        ? "pixels-native"
        : "pixels-1280x720";
  return SCREEN_PROFILES.find((p) => p.id === profile)!;
};
export interface ModelCapabilities {
  readonly screenProfile?: import("@avenire/cloud/screen").ScreenProfile;
  readonly vision: boolean;
  readonly toolResultImages: boolean;
}
export const modelCapabilities = (
  id: string,
  inputModalities: ReadonlyArray<string>,
  override: Partial<ModelCapabilities> = {},
): ModelCapabilities => ({
  screenProfile: screenProfileForModel(id),
  vision: inputModalities.includes("image"),
  // Fireworks' OpenAI-compatible tool messages carry text only; images follow as user messages.
  toolResultImages: /^(anthropic|openai|google)\//.test(id),
  ...override,
});
export class RuthModels extends Context.Service<
  RuthModels,
  {
    readonly languageModel: (name: RuthModelName) => LanguageModel;
    readonly capabilities: (name: RuthModelName) => ModelCapabilities;
    readonly maxImages: number;
  }
>()("avenire/ai/RuthModels") {}
const envName = (name: RuthModelName) => `RUTH_MODEL_${name.slice(5).toUpperCase()}`;
const Catalog = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      architecture: Schema.Struct({ input_modalities: Schema.Array(Schema.String) }),
    }),
  ),
});
const FireworksCatalog = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({ id: Schema.String, supports_image_input: Schema.optionalKey(Schema.Boolean) }),
  ),
});
class MissingProviderKey extends Schema.TaggedError<MissingProviderKey>()("MissingProviderKey", {
  model: Schema.String,
  key: Schema.String,
}) {
  override get message(): string {
    return `${this.model} needs ${this.key}`;
  }
}
class ModelCatalogError extends Schema.TaggedError<ModelCatalogError>()("ModelCatalogError", {
  cause: Schema.Defect(),
}) {}
export const RuthModelsLive = Layer.effect(
  RuthModels,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("OPENROUTER_API_KEY");
    const provider = createOpenRouter({ apiKey: Redacted.value(apiKey) });
    const catalog = yield* Effect.tryPromise({
      try: () =>
        fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(10_000) }).then(
          (r) => r.json(),
        ),
      catch: (cause) => new ModelCatalogError({ cause }),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Catalog)),
      Effect.catchCause(() =>
        Effect.logWarning(
          "OpenRouter catalog unavailable; unknown models default to text only",
        ).pipe(
          Effect.as({
            data: Object.values(RUTH_MODEL_DEFAULTS).map((id) => ({
              id,
              architecture: { input_modalities: ["text", "image"] },
            })),
          }),
        ),
      ),
    );
    const metadata = new Map(catalog.data.map((m) => [m.id, m.architecture.input_modalities]));
    const fireworksKey = yield* Config.option(Config.Redacted("FIREWORKS_API_KEY"));
    const fireworks = Option.map(fireworksKey, (key) =>
      createFireworks({ apiKey: Redacted.value(key) }),
    );
    if (Option.isSome(fireworksKey)) {
      const fireworksCatalog = yield* Effect.tryPromise({
        try: () =>
          fetch("https://api.fireworks.ai/inference/v1/models", {
            headers: { Authorization: `Bearer ${Redacted.value(fireworksKey.value)}` },
            signal: AbortSignal.timeout(10_000),
          }).then((r) => r.json()),
        catch: (cause) => new ModelCatalogError({ cause }),
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(FireworksCatalog)),
        Effect.catchCause(() =>
          Effect.logWarning("Fireworks catalog unavailable; its models default to text only").pipe(
            Effect.as({ data: [] }),
          ),
        ),
      );
      for (const m of fireworksCatalog.data)
        metadata.set(
          `${FIREWORKS_PREFIX}${m.id}`,
          m.supports_image_input ? ["text", "image"] : ["text"],
        );
    }
    const configured = yield* Effect.forEach(
      RUTH_MODEL_NAMES,
      Effect.fn("RuthModels.configure")(function* (name) {
        const id = yield* Config.String(envName(name)).pipe(
          Config.withDefault(RUTH_MODEL_DEFAULTS[name]),
        );
        const override = yield* Config.option(
          Config.Boolean(`${envName(name)}_TOOL_RESULT_IMAGES`),
        );
        const vision = yield* Config.option(Config.Boolean(`${envName(name)}_VISION`));
        return {
          name,
          id,
          capabilities: modelCapabilities(id, metadata.get(id) ?? [], {
            ...(Option.isSome(override) ? { toolResultImages: override.value } : {}),
            ...(Option.isSome(vision) ? { vision: vision.value } : {}),
          }),
        };
      }),
    );
    const languageModels = yield* Effect.forEach(configured, (m) => {
      const target = parseModelId(m.id);
      if (target.provider === "openrouter")
        return Effect.succeed([
          m.name,
          provider.chat(target.id, { parallelToolCalls: false, usage: { include: true } }),
        ] as const);
      return Option.match(fireworks, {
        onNone: () =>
          Effect.fail(new MissingProviderKey({ model: m.id, key: "FIREWORKS_API_KEY" })),
        onSome: (client) => Effect.succeed([m.name, client.chatModel(target.id)] as const),
      });
    });
    const ruth = customProvider({ languageModels: Object.fromEntries(languageModels) });
    const registry = new Map(configured.map((m) => [m.name, m.capabilities]));
    const maxImages = Math.max(
      0,
      yield* Config.Int("RUTH_MODEL_MAX_IMAGES").pipe(Config.withDefault(3)),
    );
    return RuthModels.of({
      languageModel: (name) => ruth.languageModel(name),
      capabilities: (name) => registry.get(name)!,
      maxImages,
    });
  }),
);
