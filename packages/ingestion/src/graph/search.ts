/** The graph retrieval lane: link the query to entities, then walk relations. */
import type { ChunkId, GraphFact, UserId } from "@avenire/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { GraphError } from "./extract.ts";

export interface GraphMatches {
  /** Best first; chunks connecting several linked entities rank highest. */
  readonly chunkIds: ReadonlyArray<ChunkId>;
  /** Edges walked, best first. */
  readonly facts: ReadonlyArray<GraphFact>;
}

export class GraphSearch extends Context.Service<
  GraphSearch,
  {
    readonly search: (input: {
      readonly userId: UserId;
      readonly text: string;
      /** The query's embedding, for linking it to entity descriptions. */
      readonly vector: ReadonlyArray<number>;
      readonly hops: 1 | 2;
      readonly limit: number;
    }) => Effect.Effect<GraphMatches, GraphError>;
  }
>()("avenire/ingestion/GraphSearch") {}
