/** Cross-encoder reranking of fused candidates. */
import { createCohere } from "@ai-sdk/cohere";
import { rerank } from "ai";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export class RerankError extends Schema.TaggedError<RerankError>()("RerankError", {
  documents: Schema.Number,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Reranking ${this.documents} documents failed`;
  }
}

export class Reranker extends Context.Service<
  Reranker,
  {
    readonly model: string;
    /** Every document's relevance in [0, 1], best first. `index` points into `documents`. */
    readonly rerank: (
      query: string,
      documents: ReadonlyArray<string>,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly index: number; readonly relevance: number }>,
      RerankError
    >;
  }
>()("avenire/ingestion/Reranker") {}

/** A slow reranker costs more than an un-reranked result. */
const TIMEOUT = "8 seconds";

export const RerankerLive = Layer.effect(
  Reranker,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("COHERE_API_KEY");
    const model = yield* Config.String("RERANK_MODEL").pipe(Config.withDefault("rerank-v4.0-fast"));
    const provider = createCohere({ apiKey: Redacted.value(apiKey) });
    return Reranker.of({
      model,
      rerank: Effect.fn("Reranker.rerank")(function* (query, documents) {
        if (documents.length === 0) return [];
        const result = yield* Effect.tryPromise({
          try: (abortSignal) =>
            rerank({
              model: provider.reranking(model),
              query,
              documents: [...documents],
              abortSignal,
            }),
          catch: (cause) => new RerankError({ documents: documents.length, cause }),
        }).pipe(
          Effect.timeout(TIMEOUT),
          Effect.catchTags({
            TimeoutError: (cause) =>
              Effect.fail(new RerankError({ documents: documents.length, cause })),
          }),
        );
        return result.ranking.map((entry) => ({
          index: entry.originalIndex,
          relevance: entry.score,
        }));
      }),
    });
  }),
);

const tokens = (text: string): ReadonlyArray<string> => [
  ...new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length > 2)),
];

export const RerankerTest = Layer.succeed(
  Reranker,
  Reranker.of({
    model: "test/token-overlap-v1",
    rerank: (query, documents) => {
      const queryTokens = tokens(query);
      return Effect.succeed(
        documents
          .map((document, index) => {
            const found = new Set(tokens(document));
            const relevance =
              queryTokens.length === 0
                ? 0
                : queryTokens.filter((token) => found.has(token)).length / queryTokens.length;
            return { index, relevance };
          })
          .sort((a, b) => b.relevance - a.relevance || a.index - b.index),
      );
    },
  }),
);
