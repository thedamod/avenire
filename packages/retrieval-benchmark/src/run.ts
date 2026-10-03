import type { SearchHit } from "@avenire/contracts";
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
};

const K = 10;

/** Documents in the order their first chunk was retrieved. */
const rankedDocuments = (hits: ReadonlyArray<SearchHit>): ReadonlyArray<string> => [
  ...new Set(hits.map((hit) => hit.itemId)),
];

const scoreResult = (query: BenchmarkQuery, hits: ReadonlyArray<SearchHit>): QueryResult => {
  const ranked = rankedDocuments(hits);
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
    metrics: scoreQuery(ranked, relevant, K),
  };
};

export const runBenchmark = Effect.gen(function* () {
  const retrieval = yield* Retrieval;
  const seeded = yield* seedCorpus;
  const results = yield* Effect.forEach(queries, (query) =>
    retrieval
      .search(BENCH_USER_ID, { text: query.text, limit: K })
      .pipe(Effect.map((hits) => scoreResult(query, hits))),
  );
  return { seeded, results };
});

export const summarize = (results: ReadonlyArray<QueryResult>) => {
  const grouped = aggregateBy(results.map(({ type, metrics }) => ({ group: type, metrics })));
  const overall = aggregateBy(results.map(({ metrics }) => ({ group: "overall", metrics })))[0];
  return [...grouped, ...(overall ? [overall] : [])];
};

export const formatTable = (results: ReadonlyArray<QueryResult>): string => {
  const rows = summarize(results);
  const header = ["query type", "n", "recall@10", "precision@10", "MRR", "nDCG@10"];
  const lines = [
    header.join("  "),
    ...rows.map(({ group, count, metrics }) =>
      [group, String(count), metrics.recall, metrics.precision, metrics.mrr, metrics.ndcg]
        .map((value, index) =>
          index < 2
            ? String(value).padEnd(index === 0 ? 17 : 4)
            : Number(value).toFixed(3).padStart(10),
        )
        .join("  "),
    ),
  ];
  return lines.join("\n");
};
