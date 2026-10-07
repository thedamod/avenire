/** Cross-encoder reranking of fused candidates. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
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
