/** Entity and relation extraction from chunk text, for graph retrieval. */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { generateText, Output } from "ai";

import { INGESTION_RETRY, IngestionModels } from "../models.ts";
import { normalizeForMatch } from "../text.ts";

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

const graphOutput = Output.object({
  schema: Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(ExtractedGraph)),
});

export const entityKey = (name: string): string =>
  normalizeForMatch(name)
    .replace(/^(?:the|an|a)\s+/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export interface AggregatedEntity {
  readonly key: string;
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

export interface AggregatedMention {
  readonly key: string;
  readonly chunkId: string;
}

export interface AggregatedRelation {
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly predicate: string;
  readonly description: string;
  readonly weight: number;
  readonly chunkId: string;
}

export interface AggregatedGraph {
  readonly entities: ReadonlyArray<AggregatedEntity>;
  readonly mentions: ReadonlyArray<AggregatedMention>;
  readonly relations: ReadonlyArray<AggregatedRelation>;
}

/** Merge extraction batches into the rows written for one item. */
export const aggregateGraph = (
  graph: ExtractedGraph,
  chunkIds: ReadonlyArray<string>,
): AggregatedGraph => {
  const entities = new Map<
    string,
    {
      name: string;
      description: string;
      types: Map<string, number>;
    }
  >();
  const mentions = new Map<string, AggregatedMention>();
  const relations = new Map<string, AggregatedRelation>();
  const addEntity = (name: string, type: string, description: string) => {
    const key = entityKey(name);
    if (key.length < 2) return "";
    const existing = entities.get(key);
    if (existing) {
      if (description.length > existing.description.length) existing.description = description;
      existing.types.set(type, (existing.types.get(type) ?? 0) + 1);
    } else {
      entities.set(key, { name, description, types: new Map([[type, 1]]) });
    }
    return key;
  };
  const addMention = (key: string, chunkId: string) => {
    mentions.set(`${key}\0${chunkId}`, { key, chunkId });
  };

  for (const entry of graph.chunks) {
    const chunkId = chunkIds[entry.index];
    if (chunkId === undefined) continue;
    for (const candidate of entry.entities) {
      const key = addEntity(candidate.name, candidate.type, candidate.description);
      if (key) addMention(key, chunkId);
    }
    for (const candidate of entry.relations) {
      const sourceKey = entityKey(candidate.source);
      const targetKey = entityKey(candidate.target);
      if (sourceKey.length < 2 || targetKey.length < 2 || sourceKey === targetKey) continue;
      if (!entities.has(sourceKey)) addEntity(candidate.source, "concept", "");
      if (!entities.has(targetKey)) addEntity(candidate.target, "concept", "");
      addMention(sourceKey, chunkId);
      addMention(targetKey, chunkId);
      const predicate = candidate.predicate.trim().toLowerCase();
      const relationKey = `${sourceKey}\0${targetKey}\0${predicate}\0${chunkId}`;
      if (!relations.has(relationKey)) {
        relations.set(relationKey, {
          sourceKey,
          targetKey,
          predicate,
          description: candidate.description,
          weight: Math.min(10, Math.max(1, candidate.strength)) / 10,
          chunkId,
        });
      }
    }
  }
  return {
    entities: [...entities].map(([key, value]) => ({
      key,
      name: value.name,
      description: value.description,
      type: [...value.types].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "concept",
    })),
    mentions: [...mentions.values()],
    relations: [...relations.values()],
  };
};

const SYSTEM = [
  "Extract a study knowledge graph from the numbered chunks. Return exactly one entry for each chunk index.",
  "Include the concepts, definitions, theorems, methods, named formulas, people, works, institutions and events a student would ask about.",
  "Use canonical singular names without leading articles. Prefer full names; put abbreviations in the description.",
  "At most about 12 entities and 12 relations per chunk. A relation only connects entities named in that same chunk.",
  "Predicates are short lowercase verb phrases. Strength is 1 for a weak or implied link and 10 for a stated definition or theorem.",
  "Skip generic words such as example, equation and figure.",
].join("\n");

export const GraphExtractorLive = Layer.effect(
  GraphExtractor,
  Effect.gen(function* () {
    const models = yield* IngestionModels;
    return GraphExtractor.of({
      extract: Effect.fn("GraphExtractor.extract")(function* (input) {
        if (input.chunks.length === 0) return { chunks: [] };
        const result = yield* Effect.tryPromise({
          try: (abortSignal) =>
            generateText({
              model: models.languageModel("ingest-graph"),
              system: SYSTEM,
              prompt: `Item title: ${input.title}\n\n${input.chunks.map((chunk, index) => `[${index}] ${chunk}`).join("\n\n")}`,
              output: graphOutput,
              abortSignal,
            }),
          catch: (cause) => new GraphError({ operation: "extract", cause }),
        }).pipe(Effect.retry(INGESTION_RETRY));
        return {
          chunks: result.output.chunks.filter(
            (entry) => entry.index >= 0 && entry.index < input.chunks.length,
          ),
        };
      }),
    });
  }),
);

const capitalized = /\b[A-Z][\p{L}\p{N}]*(?:\s+[A-Z][\p{L}\p{N}]*)*/gu;
const sentence = /[^.!?]+[.!?]?/gu;
/** A capitalized sentence opener that isn't part of a name. */
const opener = /^(?:The|A|An|In|This)(?:\s+|$)/u;

/** Capitalized runs as entities, linked in sentence order by the words between them. */
export const extractHeuristic = (chunks: ReadonlyArray<string>): ExtractedGraph => ({
  chunks: chunks.map((content, index) => {
    const entities: Array<ExtractedEntity> = [];
    const relations: Array<ExtractedRelation> = [];
    for (const [raw] of content.matchAll(sentence)) {
      const text = raw.trim();
      const names = [...text.matchAll(capitalized)].flatMap((match) => {
        const name = match.index === 0 ? match[0].replace(opener, "") : match[0];
        return name ? [{ name, offset: match.index + match[0].length - name.length }] : [];
      });
      for (const { name } of names) entities.push({ name, type: "concept", description: text });
      names.slice(1).forEach((target, position) => {
        const source = names[position];
        if (source === undefined) return;
        const between = text.slice(source.offset + source.name.length, target.offset).trim();
        const words = between.split(/\s+/u).filter(Boolean).length;
        relations.push({
          source: source.name,
          target: target.name,
          predicate: words > 0 && words <= 5 ? between.toLowerCase() : "related to",
          description: text,
          strength: 5,
        });
      });
    }
    return { index, entities, relations };
  }),
});

/** Offline extractor for tests and the benchmark. */
export const GraphExtractorTest = Layer.succeed(
  GraphExtractor,
  GraphExtractor.of({ extract: (input) => Effect.succeed(extractHeuristic(input.chunks)) }),
);
