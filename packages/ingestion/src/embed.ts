import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as EmbeddingModel from "effect/ai/EmbeddingModel";
import * as Schema from "effect/Schema";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiEmbeddingModel from "@effect/ai-openai/OpenAiEmbeddingModel";

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()("EmbeddingError", {
  cause: Schema.Defect(),
}) {}

export class Embedder extends Context.Service<
  Embedder,
  {
    readonly model: string;
    readonly embedMany: (
      texts: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<ReadonlyArray<number>>, EmbeddingError>;
  }
>()("avenire/ingestion/Embedder") {}

const makeEmbedder = (model: string, embed: EmbeddingModel.EmbeddingModel): Embedder["Service"] =>
  Embedder.of({
    model,
    embedMany: (texts) =>
      Effect.forEach(
        Array.from({ length: Math.ceil(texts.length / 96) }, (_, index) =>
          texts.slice(index * 96, (index + 1) * 96),
        ),
        (batch) =>
          embed.embedMany(batch).pipe(
            Effect.map((response) => response.embeddings.map(({ vector }) => vector)),
            Effect.mapError((cause) => new EmbeddingError({ cause })),
          ),
        { concurrency: 1 },
      ).pipe(Effect.map((batches) => batches.flat())),
  });

export const EmbedderLive = Layer.unwrap(
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("OPENAI_API_KEY");
    const model = yield* Config.String("EMBEDDING_MODEL").pipe(
      Config.withDefault("text-embedding-3-small"),
    );
    const openAi = yield* OpenAiClient.make({ apiKey });
    const embedding = yield* OpenAiEmbeddingModel.make({
      model,
      config: { dimensions: 1536 },
    }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, openAi));
    return Layer.succeed(Embedder, makeEmbedder(model, embedding));
  }),
);

const TEST_DIMENSIONS = 1536;

/** FNV-1a; stable across runs so test and benchmark vectors are reproducible. */
const hashToken = (token: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/**
 * Offline embedder: hashed bag-of-words unit vectors. Texts sharing vocabulary get
 * high cosine similarity, which is enough to exercise retrieval without an API key.
 */
export const EmbedderTest = Layer.succeed(
  Embedder,
  Embedder.of({
    model: "test/hashed-bow-v1",
    embedMany: (texts) =>
      Effect.succeed(
        texts.map((text) => {
          const vector = Array.from({ length: TEST_DIMENSIONS }, () => 0);
          for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
            const slot = hashToken(token) % TEST_DIMENSIONS;
            vector[slot] = (vector[slot] ?? 0) + 1;
          }
          const norm = Math.hypot(...vector) || 1;
          return vector.map((value) => value / norm);
        }),
      ),
  }),
);
