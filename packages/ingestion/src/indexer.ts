/**
 * Turns an item's extracted sections into its searchable index: chunks with
 * contextual embeddings, weighted lexical vectors and normalized text, plus the
 * item's knowledge graph. Unchanged chunks keep their rows, vectors and graph.
 */
import type { ItemId, UserId } from "@avenire/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { ChunkSection } from "./chunk.ts";

export class IndexError extends Schema.TaggedError<IndexError>()("IndexError", {
  stage: Schema.Literals(["embedding", "writing", "graphing"]),
  itemId: Schema.String,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Indexing item ${this.itemId} failed while ${this.stage}`;
  }
}

export interface IndexInput {
  readonly userId: UserId;
  readonly itemId: ItemId;
  /** Title used in contextual embedding text and the lexical vector (weight A). */
  readonly title: string;
  readonly sections: ReadonlyArray<ChunkSection>;
  /** Sections are timed transcript windows. */
  readonly transcript: boolean;
}

export interface IndexStats {
  readonly chunks: number;
  /** Chunks whose vectors had to be requested from the embedding model. */
  readonly embedded: number;
  readonly entities: number;
  readonly relations: number;
}

export class ItemIndexer extends Context.Service<
  ItemIndexer,
  {
    /**
     * Replaces the item's index with `input`'s. Provider calls happen before the
     * write, and the swap is one transaction, so a failure leaves the previous
     * index searchable. `onStage` reports progress to the caller (the job row).
     */
    readonly index: <E = never>(
      input: IndexInput,
      onStage?: (stage: "embedding" | "graphing") => Effect.Effect<void, E>,
    ) => Effect.Effect<IndexStats, IndexError | E>;
  }
>()("avenire/ingestion/ItemIndexer") {}
