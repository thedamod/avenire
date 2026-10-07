/**
 * Hybrid retrieval over the user's chunks. Several lanes (semantic, lexical, exact,
 * location, graph) each produce a ranked list; weighted Reciprocal Rank Fusion merges
 * them by rank only, a cross-encoder reranks the fused pool, and a semantic cache
 * answers repeated questions.
 *
 * Design notes: docs/design/ingestion-retrieval.md §2.5.
 */
import type { SearchQuery, SearchResult, UserId } from "@avenire/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class RetrievalError extends Schema.TaggedError<RetrievalError>()("RetrievalError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Search failed";
  }
}

export class Retrieval extends Context.Service<
  Retrieval,
  {
    readonly search: (
      userId: UserId,
      query: SearchQuery,
    ) => Effect.Effect<SearchResult, RetrievalError>;
  }
>()("avenire/ingestion/Retrieval") {}
