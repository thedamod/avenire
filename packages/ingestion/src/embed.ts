import { createCohere } from "@ai-sdk/cohere";
import { embedMany } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

/** Must match the `vector(1536)` columns in the database schema. */
export const DIMENSIONS = 1536;

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()("EmbeddingError", {
  inputType: Schema.Literals(["document", "query"]),
  count: Schema.Number,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Embedding ${this.count} ${this.inputType} text(s) failed`;
  }
}

type Vectors = ReadonlyArray<ReadonlyArray<number>>;

export class Embedder extends Context.Service<
  Embedder,
  {
    readonly model: string;
    /** Vectors for stored text: chunks and entity descriptions. */
    readonly embedDocuments: (
      texts: ReadonlyArray<string>,
    ) => Effect.Effect<Vectors, EmbeddingError>;
    /** Vectors for search queries, which asymmetric models embed differently from passages. */
    readonly embedQueries: (texts: ReadonlyArray<string>) => Effect.Effect<Vectors, EmbeddingError>;
  }
>()("avenire/ingestion/Embedder") {}

/** Reads `COHERE_API_KEY` and `EMBEDDING_MODEL`. */
export const EmbedderLive = Layer.effect(
  Embedder,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("COHERE_API_KEY");
    const model = yield* Config.String("EMBEDDING_MODEL").pipe(Config.withDefault("embed-v4.0"));
    const embedding = createCohere({ apiKey: Redacted.value(apiKey) }).embedding(model);

    // embedMany splits into provider-sized batches itself.
    const embed = (inputType: "document" | "query") => (texts: ReadonlyArray<string>) =>
      texts.length === 0
        ? Effect.succeed([])
        : Effect.tryPromise({
            try: (abortSignal) =>
              embedMany({
                model: embedding,
                values: [...texts],
                abortSignal,
                maxParallelCalls: 2,
                providerOptions: {
                  cohere: { inputType: `search_${inputType}`, outputDimension: DIMENSIONS },
                },
              }),
            catch: (cause) => new EmbeddingError({ inputType, count: texts.length, cause }),
          }).pipe(Effect.map((response) => response.embeddings));

    return Embedder.of({
      model,
      embedDocuments: Effect.fn("Embedder.embedDocuments")(embed("document")),
      embedQueries: Effect.fn("Embedder.embedQueries")(embed("query")),
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

/** Hashed bag-of-words unit vector: texts sharing vocabulary get high cosine similarity. */
const bagOfWords = (text: string): ReadonlyArray<number> => {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const slot = hashToken(token) % DIMENSIONS;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
};

/** Offline embedder, enough to exercise retrieval without an API key. */
export const EmbedderTest = Layer.succeed(
  Embedder,
  Embedder.of({
    model: "test/hashed-bow-v1",
    embedDocuments: (texts) => Effect.succeed(texts.map(bagOfWords)),
    embedQueries: (texts) => Effect.succeed(texts.map(bagOfWords)),
  }),
);
