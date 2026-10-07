/** Writes an item's entities, mentions and relations. */
import type { ChunkId, ItemId, UserId } from "@avenire/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { GraphError } from "./extract.ts";

export class GraphIndexer extends Context.Service<
  GraphIndexer,
  {
    /**
     * Extracts and stores the graph for `chunks` (new chunks only; mentions and
     * relations of deleted chunks are removed by cascade), then drops the user's
     * entities that no chunk mentions any more.
     */
    readonly indexChunks: (input: {
      readonly userId: UserId;
      readonly itemId: ItemId;
      readonly title: string;
      readonly chunks: ReadonlyArray<{ readonly id: ChunkId; readonly content: string }>;
    }) => Effect.Effect<{ readonly entities: number; readonly relations: number }, GraphError>;
  }
>()("avenire/ingestion/GraphIndexer") {}
