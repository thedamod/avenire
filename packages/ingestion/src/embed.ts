import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import * as Arr from "effect/Array";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

/** Must match the `vector(1536)` columns in the database schema. */
const DIMENSIONS = 1536;
/** Texts per embedding request. */
const BATCH_SIZE = 96;

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()("EmbeddingError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Embedding failed: ${detail}`;
  }
}

export class Embedder extends Context.Service<
  Embedder,
  {
    readonly model: string;
    readonly embedMany: (
      texts: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<ReadonlyArray<number>>, EmbeddingError>;
  }
>()("avenire/ingestion/Embedder") {}

/** Reads `OPENAI_API_KEY` and `EMBEDDING_MODEL`. */
export const EmbedderLive = Layer.effect(
  Embedder,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("OPENAI_API_KEY");
    const model = yield* Config.String("EMBEDDING_MODEL").pipe(
      Config.withDefault("text-embedding-3-small"),
    );
    const embedding = createOpenAI({ apiKey: Redacted.value(apiKey) }).embedding(model);

    const embedBatch = (batch: ReadonlyArray<string>) =>
      Effect.tryPromise({
        try: (abortSignal) =>
          embedMany({
            model: embedding,
            values: [...batch],
            abortSignal,
            providerOptions: { openai: { dimensions: DIMENSIONS } },
          }),
        catch: (cause) => new EmbeddingError({ cause }),
      }).pipe(Effect.map((response) => response.embeddings));

    return Embedder.of({
      model,
      embedMany: Effect.fn("Embedder.embedMany")(function* (texts) {
        const batches = yield* Effect.forEach(Arr.chunksOf(texts, BATCH_SIZE), embedBatch);
        return batches.flat();
      }),
    });
  }),
);

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
          const vector = Array.from({ length: DIMENSIONS }, () => 0);
          for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
            const slot = hashToken(token) % DIMENSIONS;
            vector[slot] = (vector[slot] ?? 0) + 1;
          }
          const norm = Math.hypot(...vector) || 1;
          return vector.map((value) => value / norm);
        }),
      ),
  }),
);
