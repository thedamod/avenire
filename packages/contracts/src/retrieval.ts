import * as Schema from "effect/Schema";

import { ChunkId, ClusterId, ItemId } from "./ids.ts";
import { ChunkKind, ChunkLocation } from "./ingestion.ts";
import { ItemKind } from "./library.ts";

/**
 * `standard` runs every lane on the question as written. `deep` also splits a
 * multi-part question into aspects, walks the knowledge graph two hops instead
 * of one, and keeps the best evidence for each aspect.
 */
export const SearchDepth = Schema.Literals(["standard", "deep"]);
export type SearchDepth = typeof SearchDepth.Type;

/** The candidate lists fused into one ranking. */
export const SearchLane = Schema.Literals(["semantic", "lexical", "exact", "location", "graph"]);
export type SearchLane = typeof SearchLane.Type;

export const SearchQuery = Schema.Struct({
  text: Schema.NonEmptyString,
  limit: Schema.optional(Schema.Int),
  clusterIds: Schema.optional(Schema.Array(ClusterId)),
  kinds: Schema.optional(Schema.Array(ItemKind)),
  depth: Schema.optional(SearchDepth),
});
export type SearchQuery = typeof SearchQuery.Type;

export const SearchHit = Schema.Struct({
  chunkId: ChunkId,
  itemId: ItemId,
  itemTitle: Schema.String,
  itemKind: ItemKind,
  chunkKind: ChunkKind,
  content: Schema.String,
  location: ChunkLocation,
  /** Fused rank score; only comparable within one result set. */
  score: Schema.Number,
  /** Reranker relevance in [0, 1]; null when the result was not reranked. */
  relevance: Schema.NullOr(Schema.Number),
  /** Lanes that found this chunk. */
  lanes: Schema.Array(SearchLane),
});
export type SearchHit = typeof SearchHit.Type;

/** One knowledge-graph edge the graph lane walked, with the chunk that states it. */
export const GraphFact = Schema.Struct({
  source: Schema.String,
  relation: Schema.String,
  target: Schema.String,
  chunkId: ChunkId,
  itemId: ItemId,
});
export type GraphFact = typeof GraphFact.Type;

/** A sub-question of a `deep` search and whether the results answer it. */
export const SearchAspect = Schema.Struct({
  text: Schema.String,
  covered: Schema.Boolean,
});
export type SearchAspect = typeof SearchAspect.Type;

export const SearchResult = Schema.Struct({
  hits: Schema.Array(SearchHit),
  facts: Schema.Array(GraphFact),
  aspects: Schema.Array(SearchAspect),
  /** False when the reranker was unavailable and hits are in fused order. */
  reranked: Schema.Boolean,
  /** True when nothing was relevant enough; `hits` is then empty. */
  abstained: Schema.Boolean,
  /** True when served from the semantic cache. */
  cached: Schema.Boolean,
});
export type SearchResult = typeof SearchResult.Type;
