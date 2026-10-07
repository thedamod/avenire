/** Entity and relation extraction from chunk text, for graph retrieval. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class GraphError extends Schema.TaggedError<GraphError>()("GraphError", {
  operation: Schema.Literals(["extract", "index", "search"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Knowledge graph ${this.operation} failed`;
  }
}

export const ExtractedEntity = Schema.Struct({
  name: Schema.String,
  /** Free-form category, e.g. "concept", "theorem", "person", "method". */
  type: Schema.String,
  description: Schema.String,
});
export type ExtractedEntity = typeof ExtractedEntity.Type;

export const ExtractedRelation = Schema.Struct({
  source: Schema.String,
  target: Schema.String,
  /** Short verb phrase, e.g. "is a special case of". */
  predicate: Schema.String,
  description: Schema.String,
  /** 1 (weak, implied) to 10 (stated as a definition or theorem). */
  strength: Schema.Int,
});
export type ExtractedRelation = typeof ExtractedRelation.Type;

/** Per input chunk, by its position in the request. */
export const ExtractedGraph = Schema.Struct({
  chunks: Schema.Array(
    Schema.Struct({
      index: Schema.Int,
      entities: Schema.Array(ExtractedEntity),
      relations: Schema.Array(ExtractedRelation),
    }),
  ),
});
export type ExtractedGraph = typeof ExtractedGraph.Type;

export class GraphExtractor extends Context.Service<
  GraphExtractor,
  {
    readonly extract: (input: {
      readonly title: string;
      readonly chunks: ReadonlyArray<string>;
    }) => Effect.Effect<ExtractedGraph, GraphError>;
  }
>()("avenire/ingestion/GraphExtractor") {}
