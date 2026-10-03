import * as Schema from "effect/Schema";

import { ChunkId, ClusterId, ItemId } from "./ids.ts";
import { ChunkKind, ChunkLocation } from "./ingestion.ts";
import { ItemKind } from "./library.ts";

export const SearchQuery = Schema.Struct({
  text: Schema.NonEmptyString,
  limit: Schema.optional(Schema.Int),
  clusterIds: Schema.optional(Schema.Array(ClusterId)),
  kinds: Schema.optional(Schema.Array(ItemKind)),
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
});
export type SearchHit = typeof SearchHit.Type;
