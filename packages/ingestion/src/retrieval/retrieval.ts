/**
 * Hybrid retrieval over the user's chunks. Several lanes (semantic, lexical, exact,
 * location, graph) each produce a ranked list; weighted Reciprocal Rank Fusion merges
 * them by rank only, a cross-encoder reranks the fused pool, and a semantic cache
 * answers repeated questions.
 *
 * Design notes: docs/design/ingestion-retrieval.md §2.5.
 */
import type {
  GraphFact,
  SearchDepth,
  SearchLane,
  SearchQuery,
  SearchResult,
  UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { embeddingText } from "../chunk.ts";
import { Embedder } from "../embed.ts";
import { GraphSearch } from "../graph/search.ts";
import { SemanticCache, type SearchCacheError } from "./cache.ts";
import { afterSnippet, beforeSnippet, endsMidSentence, startsMidSentence } from "./context.ts";
import { capPerItem, LANE_WEIGHTS, type Ranked, weightedRrf } from "./fusion.ts";
import {
  type CandidateRow,
  candidateFilter,
  exactLane,
  hydrate,
  LANE_LIMIT,
  lexicalLane,
  locationLane,
  neighbours,
  semanticLane,
} from "./lanes.ts";
import { QueryPlanner } from "./planner.ts";
import { analyzeQuery, optionsKey, type QueryAnalysis, resultLimit } from "./query.ts";
import { Reranker } from "./rerank.ts";

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

/** Fused candidates sent to the reranker, and how many of them one item may fill. */
const POOL_SIZE = 40;
const POOL_PER_ITEM = 4;
/** Chunks per item in the final hits. */
const HITS_PER_ITEM = 2;
const MAX_FACTS = 12;

interface LaneList {
  readonly lane: SearchLane;
  readonly weight: number;
  readonly rows: ReadonlyArray<CandidateRow>;
}

interface Candidates {
  readonly rows: ReadonlyMap<string, CandidateRow>;
  readonly pool: ReadonlyArray<Ranked>;
  readonly facts: ReadonlyArray<GraphFact>;
}

/** Rerank relevance by chunk id: against the question, and against each aspect. */
interface Relevance {
  readonly main: ReadonlyMap<string, number>;
  readonly aspects: ReadonlyArray<ReadonlyMap<string, number>>;
}

const fuse = (lists: ReadonlyArray<LaneList>) => {
  const rows: ReadonlyMap<string, CandidateRow> = new Map(
    lists.flatMap(({ rows }) => rows.map((row) => [row.chunkId, row])),
  );
  const fused = weightedRrf(
    lists.map(({ lane, weight, rows }) => ({ lane, weight, ids: rows.map((row) => row.chunkId) })),
  );
  return { rows, pool: capPerItem(fused, (id) => rows.get(id)?.itemId, POOL_SIZE, POOL_PER_ITEM) };
};

const toRelevance = (
  ranking: ReadonlyArray<{ readonly index: number; readonly relevance: number }>,
  pool: ReadonlyArray<Ranked>,
): ReadonlyMap<string, number> =>
  new Map(
    ranking.flatMap(({ index, relevance }) => {
      const entry = pool[index];
      return entry === undefined ? [] : [[entry.id, relevance] as const];
    }),
  );

const bestBy = (pool: ReadonlyArray<Ranked>, scores: ReadonlyMap<string, number>) =>
  pool.reduce<{ readonly id: string; readonly score: number } | undefined>((best, { id }) => {
    const score = scores.get(id) ?? 0;
    return best === undefined || score > best.score ? { id, score } : best;
  }, undefined);

const timeSpan = ({ startSec, endSec }: CandidateRow["location"]) =>
  startSec === undefined ? undefined : ([startSec, endSec ?? startSec] as const);

/**
 * A video's slide and the transcript playing while it was on screen are one moment,
 * so they share a result slot instead of crowding out each other (design §2.5).
 */
const sameMoment =
  (rows: ReadonlyMap<string, CandidateRow>) =>
  (a: Ranked, b: Ranked): boolean => {
    const x = rows.get(a.id);
    const y = rows.get(b.id);
    if (x === undefined || y === undefined) return false;
    const kinds = new Set([x.chunkKind, y.chunkKind]);
    const [xSpan, ySpan] = [timeSpan(x.location), timeSpan(y.location)];
    return (
      kinds.has("slide") &&
      kinds.has("transcript") &&
      xSpan !== undefined &&
      ySpan !== undefined &&
      xSpan[0] <= ySpan[1] &&
      ySpan[0] <= xSpan[1]
    );
  };

/**
 * Abstains when the best relevance is below `threshold`. Otherwise reserves each
 * aspect's best chunk (when it clears the threshold), fills by relevance (or fused
 * order when not reranked), and caps chunks per item.
 */
const shapeResult = (input: {
  readonly candidates: Candidates;
  readonly aspects: ReadonlyArray<string>;
  readonly relevance: Option.Option<Relevance>;
  readonly threshold: number;
  readonly limit: number;
}): SearchResult => {
  const { candidates, aspects, threshold } = input;
  const relevance = Option.getOrUndefined(input.relevance);
  const reranked = relevance !== undefined;
  const best = relevance === undefined ? undefined : bestBy(candidates.pool, relevance.main);
  if (reranked && (best === undefined || best.score < threshold)) {
    return {
      hits: [],
      facts: [],
      aspects: aspects.map((text) => ({ text, covered: false })),
      reranked,
      abstained: true,
      cached: false,
    };
  }

  const reserved = (relevance?.aspects ?? []).map((scores) => {
    const top = bestBy(candidates.pool, scores);
    return top !== undefined && top.score >= threshold ? top.id : undefined;
  });
  const ordered =
    relevance === undefined
      ? candidates.pool
      : candidates.pool.toSorted(
          (a, b) => (relevance.main.get(b.id) ?? 0) - (relevance.main.get(a.id) ?? 0),
        );
  const byId = new Map(candidates.pool.map((entry) => [entry.id, entry]));
  const first = reserved.flatMap((id) => (id === undefined ? [] : (byId.get(id) ?? [])));
  const unique = [...new Map([...first, ...ordered].map((entry) => [entry.id, entry])).values()];
  const kept = capPerItem(
    unique,
    (id) => candidates.rows.get(id)?.itemId,
    input.limit,
    HITS_PER_ITEM,
    sameMoment(candidates.rows),
  );

  const hits = kept.flatMap((entry) => {
    const row = candidates.rows.get(entry.id);
    if (row === undefined) return [];
    const score = relevance?.main.get(entry.id) ?? null;
    const { ordinal: _ordinal, ...hit } = row;
    return [{ ...hit, score: entry.score, relevance: score, lanes: entry.lanes }];
  });
  const hitIds = new Set<string>(hits.map((hit) => hit.chunkId));
  return {
    hits,
    facts: candidates.facts
      .toSorted((a, b) => Number(hitIds.has(b.chunkId)) - Number(hitIds.has(a.chunkId)))
      .slice(0, MAX_FACTS),
    aspects: aspects.map((text, index) => {
      const id = reserved[index];
      return { text, covered: id !== undefined && hitIds.has(id) };
    }),
    reranked,
    abstained: false,
    cached: false,
  };
};

export const RetrievalLive = Layer.effect(
  Retrieval,
  Effect.gen(function* () {
    const database = yield* Database;
    const embedder = yield* Embedder;
    const reranker = yield* Reranker;
    const planner = yield* QueryPlanner;
    const cache = yield* SemanticCache;
    const graph = yield* GraphSearch;
    const threshold = yield* Config.Number("RETRIEVAL_MIN_RELEVANCE").pipe(Config.withDefault(0.1));

    /** A cache failure is a miss, never a failed search. */
    const fromCache = (lookup: Effect.Effect<Option.Option<SearchResult>, SearchCacheError>) =>
      lookup.pipe(
        Effect.map(Option.map((result) => ({ ...result, cached: true }))),
        Effect.catchTags({
          SearchCacheError: (error) =>
            Effect.as(Effect.logWarning("Search cache lookup failed", error), Option.none()),
        }),
      );

    /** Aspects for deep search; a planner failure degrades to a standard search. */
    const planAspects = (depth: SearchDepth, text: string) =>
      depth === "standard"
        ? Effect.succeed<ReadonlyArray<string>>([])
        : planner.plan(text).pipe(
            Effect.catchTags({
              PlannerError: (error) =>
                Effect.as(Effect.logWarning("Search planning failed", error), []),
            }),
          );

    /** The graph lane is enrichment: if it fails, the other lanes still answer. */
    const graphLane = (
      where: Parameters<typeof hydrate>[0],
      input: Parameters<typeof graph.search>[0],
    ) =>
      graph.search(input).pipe(
        Effect.flatMap(({ chunkIds, facts }) =>
          Effect.map(hydrate(where, chunkIds), (rows) => ({
            rows,
            facts: facts.filter((fact) => rows.some((row) => row.chunkId === fact.chunkId)),
          })),
        ),
        Effect.catchTags({
          GraphError: (error) =>
            Effect.as(Effect.logWarning("Graph search failed", error), { rows: [], facts: [] }),
        }),
      );

    /** Lanes that need only the query text; they run while the query is embedded. */
    const textLanes = (where: Parameters<typeof hydrate>[0], analysis: QueryAnalysis) =>
      Effect.all(
        [lexicalLane(where, analysis), exactLane(where, analysis), locationLane(where, analysis)],
        { concurrency: "unbounded" },
      );

    /** Each aspect's own semantic and lexical lists. */
    const aspectLanes = (where: Parameters<typeof hydrate>[0], aspects: ReadonlyArray<string>) =>
      aspects.length === 0
        ? Effect.succeed([])
        : embedder
            .embedQueries(aspects)
            .pipe(
              Effect.flatMap((vectors) =>
                Effect.forEach(
                  aspects,
                  (aspect, index) =>
                    Effect.all(
                      [
                        semanticLane(where, embedder.model, vectors[index] ?? []),
                        lexicalLane(where, analyzeQuery(aspect)),
                      ],
                      { concurrency: 2 },
                    ),
                  { concurrency: "unbounded" },
                ),
              ),
            );

    /** Before/after snippets for hits cut mid-sentence; without them on failure. */
    const withContext = (
      where: Parameters<typeof hydrate>[0],
      hits: SearchResult["hits"],
      rows: Candidates["rows"],
    ) => {
      const wanted = hits.flatMap(({ chunkId, itemId, content }) => {
        const ordinal = rows.get(chunkId)?.ordinal;
        if (ordinal === undefined) return [];
        return [
          ...(startsMidSentence(content) && ordinal > 0 ? [{ itemId, ordinal: ordinal - 1 }] : []),
          ...(endsMidSentence(content) ? [{ itemId, ordinal: ordinal + 1 }] : []),
        ];
      });
      return neighbours(where, wanted).pipe(
        Effect.map((found) => {
          const byPosition = new Map(
            found.map((row) => [`${row.itemId}:${row.ordinal}`, row.content]),
          );
          return hits.map((hit) => {
            const ordinal = rows.get(hit.chunkId)?.ordinal ?? -1;
            const previous = byPosition.get(`${hit.itemId}:${ordinal - 1}`);
            const next = byPosition.get(`${hit.itemId}:${ordinal + 1}`);
            const before = previous === undefined ? "" : beforeSnippet(previous, hit.content);
            const after = next === undefined ? "" : afterSnippet(hit.content, next);
            return before || after ? { ...hit, context: { before, after } } : hit;
          });
        }),
        Effect.catchTags({
          DatabaseError: (error) => Effect.as(Effect.logWarning("Hit context failed", error), hits),
          SchemaError: (error) => Effect.as(Effect.logWarning("Hit context failed", error), hits),
        }),
      );
    };

    const rerank = (text: string, aspects: ReadonlyArray<string>, candidates: Candidates) => {
      const documents = candidates.pool.map(({ id }) => {
        const row = candidates.rows.get(id);
        return row === undefined ? "" : embeddingText(row.itemTitle, row);
      });
      return Effect.forEach(
        [text, ...aspects],
        (question) => reranker.rerank(question, documents),
        {
          concurrency: "unbounded",
        },
      ).pipe(
        Effect.map(([main = [], ...rest]) =>
          Option.some<Relevance>({
            main: toRelevance(main, candidates.pool),
            aspects: rest.map((ranking) => toRelevance(ranking, candidates.pool)),
          }),
        ),
        Effect.catchTags({
          RerankError: (error) =>
            Effect.as(Effect.logWarning("Reranking failed", error), Option.none<Relevance>()),
        }),
      );
    };

    const search = Effect.fn("Retrieval.search")(
      function* (userId: UserId, query: SearchQuery) {
        const analysis = analyzeQuery(query.text);
        const key = { userId, optionsKey: optionsKey(query, analysis) };
        const repeat = yield* fromCache(cache.lookupExact(key, analysis.normalized));
        if (Option.isSome(repeat)) return repeat.value;

        const where = candidateFilter(userId, query);
        // Planning, embedding the question and the text-only lanes don't depend on
        // each other; everything that needs the vector or the aspects waits for them.
        const [aspects, [vector = []], [lexical, exact, location]] = yield* Effect.all(
          [
            planAspects(query.depth ?? "standard", analysis.text),
            embedder.embedQueries([analysis.text]),
            textLanes(where, analysis),
          ],
          { concurrency: "unbounded" },
        );
        const similar = yield* fromCache(cache.lookupSimilar(key, vector));
        if (Option.isSome(similar)) return similar.value;

        const [semantic, graphed, aspectLists] = yield* Effect.all(
          [
            semanticLane(where, embedder.model, vector),
            graphLane(where, {
              userId,
              text: analysis.text,
              query,
              vector,
              hops: query.depth === "deep" ? 2 : 1,
              limit: LANE_LIMIT,
            }),
            aspectLanes(where, aspects),
          ],
          { concurrency: "unbounded" },
        );
        const candidates: Candidates = {
          ...fuse([
            { lane: "semantic", weight: LANE_WEIGHTS.semantic, rows: semantic },
            { lane: "lexical", weight: LANE_WEIGHTS.lexical, rows: lexical },
            { lane: "exact", weight: LANE_WEIGHTS.exact, rows: exact },
            { lane: "location", weight: LANE_WEIGHTS.location, rows: location },
            { lane: "graph", weight: LANE_WEIGHTS.graph, rows: graphed.rows },
            ...aspectLists.flatMap(([rows, lexicalRows]): ReadonlyArray<LaneList> => [
              { lane: "semantic", weight: LANE_WEIGHTS.aspect, rows },
              { lane: "lexical", weight: LANE_WEIGHTS.aspect, rows: lexicalRows },
            ]),
          ]),
          facts: graphed.facts,
        };
        const relevance = yield* rerank(query.text, aspects, candidates);
        const shaped = shapeResult({
          candidates,
          aspects,
          relevance,
          threshold,
          limit: resultLimit(query),
        });
        const result = {
          ...shaped,
          hits: yield* withContext(where, shaped.hits, candidates.rows),
        };
        // A degraded (un-reranked) result is never cached.
        if (result.reranked) {
          yield* cache.store(key, { queryText: analysis.normalized, vector, result }).pipe(
            Effect.catchTags({
              SearchCacheError: (error) => Effect.logWarning("Search cache store failed", error),
            }),
          );
        }
        return result;
      },
      Effect.provideService(Database, database),
      Effect.mapError((cause) => new RetrievalError({ cause })),
    );

    return Retrieval.of({ search });
  }),
);
