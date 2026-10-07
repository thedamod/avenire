import type { SearchDepth, SearchHit, SearchResult } from "@avenire/contracts";
import { Retrieval } from "@avenire/ingestion/retrieval";
import * as Effect from "effect/Effect";

import { type BenchmarkQuery, queries, type QueryType } from "./dataset/index.ts";
import { aggregateBy, type MetricValues, scoreQuery } from "./metrics.ts";
import { BENCH_USER_ID, seedCorpus } from "./seed.ts";

export type QueryResult = {
  readonly id: string;
  readonly type: QueryType;
  readonly text: string;
  readonly expected: ReadonlyArray<string>;
  readonly ranked: ReadonlyArray<string>;
  readonly metrics: MetricValues;
  readonly abstained: boolean;
};

const K = 10;

/** Documents in the order their first chunk was retrieved. */
const rankedDocuments = (hits: ReadonlyArray<SearchHit>): ReadonlyArray<string> => [
  ...new Set(hits.map((hit) => hit.itemId)),
];

const scoreResult = (query: BenchmarkQuery, result: SearchResult): QueryResult => {
  const ranked = rankedDocuments(result.hits);
  const relevant = query.relevant.map(({ documentId, grade }) => ({
    documentId,
    ...(grade === undefined ? {} : { grade }),
  }));
  return {
    id: query.id,
    type: query.type,
    text: query.text,
    expected: query.relevant.map(({ documentId }) => documentId),
    ranked,
    abstained: result.abstained,
    metrics: scoreQuery(ranked, relevant, K),
  };
};

export const runBenchmark = Effect.fn("RetrievalBenchmark.run")(function* (depth: SearchDepth) {
  const retrieval = yield* Retrieval;
  const seeded = yield* seedCorpus;
  const results = yield* Effect.forEach(queries, (query) =>
    retrieval
      .search(BENCH_USER_ID, { text: query.text, limit: K, depth })
      .pipe(Effect.map((result) => scoreResult(query, result))),
  );
  return { seeded, results };
});

export const summarize = (results: ReadonlyArray<QueryResult>) => {
  const abstained = (group: string) =>
    results.filter((result) => result.abstained && (group === "overall" || result.type === group))
      .length;
  const grouped = aggregateBy(results.map(({ type, metrics }) => ({ group: type, metrics })));
  const overall = aggregateBy(results.map(({ metrics }) => ({ group: "overall", metrics })));
  return [...grouped, ...overall].map((row) => ({ ...row, abstained: abstained(row.group) }));
};

export const formatTable = (results: ReadonlyArray<QueryResult>): string => {
  const score = (value: number) => value.toFixed(3).padStart(12);
  const header = [
    "query type".padEnd(17),
    "n".padEnd(4),
    ...["recall@10", "precision@10", "MRR", "nDCG@10"].map((name) => name.padStart(12)),
    "abstained".padStart(9),
  ];
  const rows = summarize(results).map(({ group, count, metrics, abstained }) =>
    [
      group.padEnd(17),
      String(count).padEnd(4),
      score(metrics.recall),
      score(metrics.precision),
      score(metrics.mrr),
      score(metrics.ndcg),
      String(abstained).padStart(9),
    ].join("  "),
  );
  return [header.join("  "), ...rows].join("\n");
};
