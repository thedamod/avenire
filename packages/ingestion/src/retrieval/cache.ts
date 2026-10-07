/** Semantic cache: reuse a recent result for the same or a near-identical question. */
import type { SearchResult, UserId } from "@avenire/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export class SearchCacheError extends Schema.TaggedError<SearchCacheError>()("SearchCacheError", {
  operation: Schema.Literals(["lookup", "store", "invalidate"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Search cache ${this.operation} failed`;
  }
}

export interface CacheKey {
  readonly userId: UserId;
  /** Fingerprint of everything but the wording: filters, limit, depth, locations, phrases. */
  readonly optionsKey: string;
}

export class SemanticCache extends Context.Service<
  SemanticCache,
  {
    /** An unexpired result for the same normalized text, without embedding it. */
    readonly lookupExact: (
      key: CacheKey,
      queryText: string,
    ) => Effect.Effect<Option.Option<SearchResult>, SearchCacheError>;
    /** An unexpired result whose query embedding is within the similarity threshold. */
    readonly lookupSimilar: (
      key: CacheKey,
      vector: ReadonlyArray<number>,
    ) => Effect.Effect<Option.Option<SearchResult>, SearchCacheError>;
    readonly store: (
      key: CacheKey,
      entry: {
        readonly queryText: string;
        readonly vector: ReadonlyArray<number>;
        readonly result: SearchResult;
      },
    ) => Effect.Effect<void, SearchCacheError>;
    /** Drops the user's entries; call whenever their searchable corpus changes. */
    readonly invalidate: (userId: UserId) => Effect.Effect<void, SearchCacheError>;
  }
>()("avenire/ingestion/SemanticCache") {}
