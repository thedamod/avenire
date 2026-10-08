/**
 * Runs v1's benchmark (corpus v0.3, its qrels and metric definitions) against v2:
 * ingests every artifact through v2's extractors and indexer, then scores
 * `Retrieval.search` per query, serially, with wall-clock latency.
 */
import {
  type ExtractionCoverage,
  ItemId,
  type ItemKind,
  type SearchDepth,
  type SearchResult,
  UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { chunk, item, user } from "@avenire/database/schema";
import type { ChunkSection } from "@avenire/ingestion/chunk";
import { extract } from "@avenire/ingestion/extract";
import { ItemIndexer } from "@avenire/ingestion/indexer";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { and, eq, sql } from "drizzle-orm";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { readArtifact } from "./corpus.ts";
import type { BenchmarkArtifact, BenchmarkDataset } from "./domain.ts";
import { evaluateQueryTrace } from "./evaluate-trace.ts";
import { materializeEvidence, type MaterializationCandidate } from "./materialize-qrels.ts";
import { aggregateEvaluations, type RankingEvaluation } from "./metrics.ts";

export const BENCH_USER_ID = UserId.make("bench-v1");
const ITEM_PREFIX = "bench-v1:";
const itemIdOf = (artifact: BenchmarkArtifact) => ItemId.make(`${ITEM_PREFIX}${artifact.id}`);

/** Keep embedding-heavy PDF ingestion below the provider's per-minute burst limit. */
const INGEST_CONCURRENCY = 2;
/**
 * Minimum time per Cohere rerank call a query makes. The trial key allows 10 rerank
 * calls a minute (6 s each), and a 429 degrades the query. Waiting isn't timed.
 */
export const RERANK_CALL_INTERVAL_MS = 6_500;
/** Rate-limited calls wait for the provider's per-minute window to refill. */
const RATE_LIMIT_RETRY = { schedule: Schedule.spaced("60 seconds"), times: 2 } as const;
/** A query that came back unreranked or failed is retried once after a minute. */
const DEGRADED_RETRY_DELAY = "60 seconds";
const isTransient = (failure: unknown) => !isQuotaExhausted(failure) && !isRateLimited(failure);

/** Rerank calls a search makes: one per question, none when served from the cache. */
export const rerankCalls = (depth: SearchDepth, result: SearchResult): number =>
  result.cached ? 0 : depth === "deep" ? 1 + result.aspects.length : 1;

export class CorpusError extends Schema.TaggedError<CorpusError>()("CorpusError", {
  artifactId: Schema.String,
  reason: Schema.String,
}) {
  override get message(): string {
    return `Corpus artifact ${this.artifactId}: ${this.reason}`;
  }
}

export interface ArtifactResult {
  readonly id: string;
  readonly sourceType: string;
  readonly status: "indexed" | "reused" | "partial" | "failed";
  readonly coverage?: ExtractionCoverage;
  readonly chunks?: number;
  readonly wallMs: number;
  readonly reason?: string;
}

export interface QueryResult {
  readonly id: string;
  readonly family: string;
  readonly split: "development" | "test";
  readonly latencyMs: number;
  readonly abstained: boolean;
  /** Best reranker relevance among the hits, for calibrating the abstention threshold. */
  readonly topRelevance: number | null;
  readonly returnedCount: number;
  readonly missingEvidenceIds: ReadonlyArray<string>;
  readonly evaluation: RankingEvaluation;
  readonly error?: string;
  /** Set when reranking failed even after a retry, so the query was scored degraded. */
  readonly unreranked?: true;
}

/** The innermost messages of a failure chain, for logs and run files. */
const describeFailure = (failure: unknown): string => {
  const messages: Array<string> = [];
  let current: unknown = Cause.isCause(failure) ? Cause.squash(failure) : failure;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if (current instanceof Error) messages.push(current.message);
    current = "cause" in current ? current.cause : undefined;
  }
  if (current !== undefined && current !== null) messages.push(String(current));
  return messages.join(": ").slice(0, 400);
};

const isQuotaExhausted = (failure: unknown) =>
  /monthly|per month|trial key.*limit|embedding quota/i.test(describeFailure(failure));

const isRateLimited = (failure: unknown) =>
  !isQuotaExhausted(failure) &&
  /rate limit|too many requests|429|high demand/i.test(describeFailure(failure));

const kindOf = (sourceType: BenchmarkArtifact["sourceType"]): ItemKind =>
  sourceType === "markdown" ? "note" : sourceType === "link" ? "web-page" : sourceType;

const chunkStats = (id: ItemId) =>
  Effect.flatMap(Effect.service(Database), (database) =>
    database.use((db) =>
      db
        .select({
          chunks: sql<number>`count(*)::int`,
          graphPending: sql<number>`count(*) filter (where not ${chunk.graphIndexed})::int`,
        })
        .from(chunk)
        .where(and(eq(chunk.userId, BENCH_USER_ID), eq(chunk.itemId, id))),
    ),
  ).pipe(
    Effect.map(([row]) => ({ chunks: row?.chunks ?? 0, graphPending: row?.graphPending ?? 0 })),
  );

const ensureUser = Effect.flatMap(Effect.service(Database), (database) =>
  database.use((db) =>
    db
      .insert(user)
      .values({
        id: BENCH_USER_ID,
        name: "V1 benchmark",
        email: "bench-v1@avenire.invalid",
        emailVerified: true,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .onConflictDoNothing(),
  ),
);

const indexSections = Effect.fn("V1Benchmark.indexSections")(function* (
  id: ItemId,
  title: string,
  sections: ReadonlyArray<ChunkSection>,
) {
  const indexer = yield* ItemIndexer;
  return yield* indexer.index({ userId: BENCH_USER_ID, itemId: id, title, sections }).pipe(
    Effect.retry({
      ...RATE_LIMIT_RETRY,
      while: (error) => error.stage === "embedding" && isRateLimited(error),
    }),
    Effect.as(false),
    Effect.catchTags({
      IndexError: (error) =>
        error.stage === "graphing" ? Effect.succeed(true) : Effect.fail(error),
    }),
  );
});

/** Indexes one artifact, or reuses its index when the stored bytes are unchanged. */
const ingestOne = Effect.fn("V1Benchmark.ingestOne")(function* (
  artifact: BenchmarkArtifact,
  corpusDir: string,
  reingest: boolean,
) {
  const database = yield* Database;
  const id = itemIdOf(artifact);
  const [stored] = yield* database.use((db) =>
    db
      .select({ contentHash: item.contentHash })
      .from(item)
      .where(and(eq(item.userId, BENCH_USER_ID), eq(item.id, id))),
  );
  const before = yield* chunkStats(id);
  if (!reingest && stored?.contentHash === artifact.sha256 && before.chunks > 0) {
    return before.graphPending === 0
      ? ({ status: "reused", chunks: before.chunks } as const)
      : ({
          status: "partial",
          chunks: before.chunks,
          reason: "Graph indexing pending from an earlier run",
        } as const);
  }

  const bytes = yield* Effect.tryPromise({
    try: () => readArtifact(corpusDir, artifact),
    catch: (cause) => new CorpusError({ artifactId: artifact.id, reason: describeFailure(cause) }),
  });
  if (bytes === null) {
    return yield* new CorpusError({ artifactId: artifact.id, reason: "missing from the corpus" });
  }
  const source = {
    kind: kindOf(artifact.sourceType),
    title: artifact.title,
    mimeType: artifact.mimeType,
    sourceUrl: artifact.canonicalUrl ?? null,
    bytes,
  };
  const document = yield* extract(source);
  yield* database.use((db) =>
    db
      .insert(item)
      .values({
        id,
        userId: BENCH_USER_ID,
        kind: source.kind,
        title: artifact.title,
        placement: "filed",
        mimeType: artifact.mimeType,
        sizeBytes: artifact.byteSize,
        sourceUrl: artifact.canonicalUrl,
        dedupeKey: `v1-benchmark:${artifact.id}`,
      })
      .onConflictDoUpdate({
        target: item.id,
        set: { title: artifact.title, updatedAt: sql`now()` },
      }),
  );
  // A failed graph stage leaves the chunks searchable (graph_indexed = false); the
  // benchmark records that as partial rather than losing the artifact.
  const graphFailed = yield* indexSections(id, artifact.title, document.sections);
  yield* database.use((db) =>
    db
      .update(item)
      .set({ contentHash: artifact.sha256 })
      .where(and(eq(item.userId, BENCH_USER_ID), eq(item.id, id))),
  );
  const after = yield* chunkStats(id);
  return {
    status: graphFailed || after.graphPending > 0 ? "partial" : "indexed",
    coverage: document.coverage,
    chunks: after.chunks,
  } as const;
});

const ingestCorpus = Effect.fn("V1Benchmark.ingestCorpus")(function* (
  artifacts: ReadonlyArray<BenchmarkArtifact>,
  corpusDir: string,
  reingest: boolean,
) {
  yield* ensureUser;
  let done = 0;
  return yield* Effect.forEach(
    artifacts,
    (artifact) =>
      ingestOne(artifact, corpusDir, reingest).pipe(
        Effect.map((outcome): Omit<ArtifactResult, "wallMs"> => ({
          id: artifact.id,
          sourceType: artifact.sourceType,
          ...outcome,
        })),
        Effect.catchCause((cause) => {
          const failure = Cause.squash(cause);
          return isQuotaExhausted(failure) || isRateLimited(failure)
            ? Effect.fail(failure)
            : Effect.succeed<Omit<ArtifactResult, "wallMs">>({
                id: artifact.id,
                sourceType: artifact.sourceType,
                status: "failed",
                reason: describeFailure(failure),
              });
        }),
        Effect.timed,
        Effect.map(([elapsed, result]): ArtifactResult => ({
          ...result,
          wallMs: Duration.toMillis(elapsed),
        })),
        Effect.tap((result) =>
          Effect.logInfo(
            `Corpus ${++done}/${artifacts.length}: ${result.id} ${result.status} in ${(result.wallMs / 1000).toFixed(1)} s${result.reason ? ` (${result.reason})` : ""}`,
          ),
        ),
      ),
    { concurrency: INGEST_CONCURRENCY },
  );
});

/** Every benchmark chunk with its artifact and location, for materializing qrels. */
const loadCandidates = Effect.fn("V1Benchmark.loadCandidates")(function* () {
  const database = yield* Database;
  const rows = yield* database.use((db) =>
    db
      .select({
        itemId: chunk.itemId,
        chunkId: chunk.id,
        content: chunk.content,
        location: chunk.location,
      })
      .from(chunk)
      .where(eq(chunk.userId, BENCH_USER_ID)),
  );
  return rows.flatMap(
    ({ itemId, chunkId, content, location }): ReadonlyArray<MaterializationCandidate> =>
      itemId.startsWith(ITEM_PREFIX)
        ? [
            {
              artifactId: itemId.slice(ITEM_PREFIX.length),
              chunkId,
              content,
              ...(location.page === undefined ? {} : { page: location.page }),
              ...(location.slide === undefined ? {} : { slide: location.slide }),
              ...(location.sheet === undefined ? {} : { sheet: location.sheet }),
              ...(location.startSec === undefined ? {} : { startMs: location.startSec * 1000 }),
              ...(location.endSec === undefined ? {} : { endMs: location.endSec * 1000 }),
            },
          ]
        : [],
  );
});

const score = (
  dataset: BenchmarkDataset,
  query: BenchmarkDataset["queries"][number],
  materialized: ReturnType<typeof materializeEvidence>,
  result: SearchResult,
  latencyMs: number,
  error?: string,
): QueryResult | undefined => {
  const [trace] = evaluateQueryTrace({
    dataset,
    materializedEvidence: materialized,
    queryId: query.id,
    snapshots: [
      {
        candidates: result.hits.map(({ chunkId, score }) => ({ chunkId, score })),
        path: "full",
        queryKind: "original",
        stage: "final",
      },
    ],
  });
  if (trace === undefined) return undefined;
  const relevances = result.hits.flatMap((hit) => (hit.relevance === null ? [] : [hit.relevance]));
  return {
    id: query.id,
    family: query.family,
    split: query.split,
    latencyMs,
    abstained: result.abstained,
    topRelevance: relevances.length > 0 ? Math.max(...relevances) : null,
    returnedCount: result.hits.length,
    missingEvidenceIds: trace.evidenceCoverage.missingRequiredEvidenceIds,
    evaluation: trace.evaluation,
    ...(error === undefined ? {} : { error }),
  };
};

const noResult: SearchResult = {
  hits: [],
  facts: [],
  aspects: [],
  reranked: false,
  abstained: false,
  cached: false,
};

const evaluate = Effect.fn("V1Benchmark.evaluate")(function* (
  dataset: BenchmarkDataset,
  depth: SearchDepth,
  split: "all" | "development" | "test",
) {
  const retrieval = yield* Retrieval;
  const materialized = materializeEvidence(
    dataset.evidence.map(({ id, artifactId, locator }) => ({
      evidenceId: id,
      artifactId,
      locator,
    })),
    yield* loadCandidates(),
  );
  const search = (text: string) =>
    retrieval
      .search(BENCH_USER_ID, { text, limit: 10, depth })
      .pipe(Effect.retry({ ...RATE_LIMIT_RETRY, while: isRateLimited }));

  const timedSearch = Effect.fn("V1Benchmark.timedSearch")(function* (text: string) {
    const startedMs = yield* Clock.currentTimeMillis;
    const [elapsed, outcome] = yield* Effect.timed(Effect.result(search(text)));
    return { startedMs, latencyMs: Duration.toMillis(elapsed), outcome };
  });
  const pace = Effect.fn("V1Benchmark.pace")(function* (startedMs: number, calls: number) {
    const wait = startedMs + RERANK_CALL_INTERVAL_MS * calls - (yield* Clock.currentTimeMillis);
    if (wait > 0) yield* Effect.sleep(Duration.millis(wait));
  });

  // Warm connection pools and provider clients outside the timed queries.
  const warmup = yield* timedSearch("Benchmark warmup query outside the evaluation dataset");
  yield* pace(
    warmup.startedMs,
    warmup.outcome._tag === "Success" ? rerankCalls(depth, warmup.outcome.success) : 1,
  );

  const queries = dataset.queries.filter((query) => split === "all" || query.split === split);
  const results: Array<QueryResult> = [];
  for (const query of queries) {
    let attempt = yield* timedSearch(query.text);
    if (
      attempt.outcome._tag === "Failure"
        ? isTransient(attempt.outcome.failure)
        : !attempt.outcome.success.reranked
    ) {
      yield* Effect.logWarning(`Query ${query.id} was degraded or failed; retrying once`);
      yield* Effect.sleep(DEGRADED_RETRY_DELAY);
      attempt = yield* timedSearch(query.text);
    }
    const { startedMs, latencyMs, outcome } = attempt;
    if (
      outcome._tag === "Failure" &&
      (isQuotaExhausted(outcome.failure) || isRateLimited(outcome.failure))
    ) {
      return yield* Effect.fail(outcome.failure);
    }
    const unreranked = outcome._tag === "Success" && !outcome.success.reranked;
    const scored =
      outcome._tag === "Success"
        ? score(dataset, query, materialized, outcome.success, latencyMs)
        : score(
            dataset,
            query,
            materialized,
            noResult,
            latencyMs,
            describeFailure(outcome.failure),
          );
    if (scored !== undefined) results.push(unreranked ? { ...scored, unreranked: true } : scored);
    yield* Effect.logInfo(
      `Query ${results.length}/${queries.length}: ${query.id} ${latencyMs.toFixed(0)} ms${scored?.error ? " failed" : ""}${unreranked ? " unreranked" : ""}`,
    );
    yield* pace(
      startedMs,
      rerankCalls(depth, outcome._tag === "Success" ? outcome.success : noResult),
    );
  }
  return {
    results,
    materializedEvidence: materialized.filter((row) => row.chunkIds.length > 0).length,
    evidence: materialized.length,
  };
});

export const runV1Benchmark = Effect.fn("V1Benchmark.run")(function* (input: {
  readonly artifacts: ReadonlyArray<BenchmarkArtifact>;
  readonly dataset: BenchmarkDataset;
  readonly corpusDir: string;
  readonly depth: SearchDepth;
  readonly split: "all" | "development" | "test";
  readonly reingest: boolean;
}) {
  const artifacts = yield* ingestCorpus(input.artifacts, input.corpusDir, input.reingest);
  const cache = yield* SemanticCache;
  yield* cache.invalidate(BENCH_USER_ID);
  return { artifacts, ...(yield* evaluate(input.dataset, input.depth, input.split)) };
});

const quantile = (values: ReadonlyArray<number>, q: number): number | null => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
};

export const summarize = (results: ReadonlyArray<QueryResult>) => {
  const aggregate = aggregateEvaluations(results.map((result) => result.evaluation));
  const negatives = results.filter((result) => result.family === "unanswerable");
  const truePositives = negatives.filter((result) => result.abstained).length;
  const falseAbstentions = results.filter(
    (result) => result.family !== "unanswerable" && result.abstained,
  ).length;
  const precision =
    truePositives + falseAbstentions > 0
      ? truePositives / (truePositives + falseAbstentions)
      : null;
  const recall = negatives.length > 0 ? truePositives / negatives.length : null;
  const latencies = results.map((result) => result.latencyMs);
  return {
    count: results.length,
    mrr: aggregate.mrrAt10,
    ndcg: aggregate.ndcgAtK["ndcg@10"] ?? null,
    recall: aggregate.recallAtK["recall@10"] ?? null,
    allEvidence: aggregate.requiredEvidenceSuccessAtK["all-evidence@10"] ?? null,
    fpr: aggregate.unanswerableFalsePositiveRate,
    abstentionPrecision: precision,
    abstentionRecall: recall,
    abstentionF1:
      precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0,
    falseAbstentions,
    latency: {
      p50: quantile(latencies, 0.5),
      p90: quantile(latencies, 0.9),
      p95: quantile(latencies, 0.95),
      max: quantile(latencies, 1),
    },
    missingEvidenceQueries: results.filter((result) => result.missingEvidenceIds.length > 0).length,
    failedQueries: results.filter((result) => result.error !== undefined).length,
  };
};

/** v1's published final run (all 84 queries), from its benchmark report of 22 July 2026. */
export const V1_FINAL = {
  overall: { mrr: 0.708, ndcg: 0.665, recall: 0.702, fpr: 0.2, p50: 8820, p95: 12730 },
  best: { mrr: 0.769, ndcg: 0.713, recall: 0.746, fpr: 0.9 },
  families: {
    "cross-file": { mrr: 0.607, ndcg: 0.529, recall: 0.599, allEvidence: 0.5 },
    "multi-hop": { mrr: 0.592, ndcg: 0.502, recall: 0.574, allEvidence: 0.6 },
    "formula-chart": { mrr: 0.514, ndcg: 0.56, recall: 0.7, allEvidence: 0.7 },
    timestamp: { mrr: 0.636, ndcg: 0.469, recall: 0.426, allEvidence: 0.636 },
    paraphrase: { mrr: 0.825, ndcg: 0.825, recall: 0.833, allEvidence: 0.9 },
  },
} as const;

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "  n/a" : `${(100 * value).toFixed(1)}%`.padStart(6);

export const formatReport = (
  artifacts: ReadonlyArray<ArtifactResult>,
  results: ReadonlyArray<QueryResult>,
): string => {
  const row = (name: string, rows: ReadonlyArray<QueryResult>) => {
    const s = summarize(rows);
    return [
      name.padEnd(16),
      String(s.count).padStart(3),
      pct(s.mrr),
      pct(s.ndcg),
      pct(s.recall),
      pct(s.allEvidence),
      pct(s.fpr),
      pct(s.abstentionF1),
    ].join("  ");
  };
  const families = [...new Set(results.map((result) => result.family))].sort();
  const s = summarize(results);
  const failed = artifacts.filter((artifact) => artifact.status === "failed");
  const unreranked = results.filter((result) => result.unreranked);
  return [
    "scope               n     MRR   nDCG  Recall  AllEv     FPR   AbstF1",
    row("all", results),
    row(
      "test",
      results.filter((result) => result.split === "test"),
    ),
    ...families.map((family) =>
      row(
        `  ${family}`,
        results.filter((result) => result.family === family),
      ),
    ),
    `latency ms  p50 ${s.latency.p50?.toFixed(0)}  p90 ${s.latency.p90?.toFixed(0)}  p95 ${s.latency.p95?.toFixed(0)}  max ${s.latency.max?.toFixed(0)}   (v1 final: p50 ${V1_FINAL.overall.p50}, p95 ${V1_FINAL.overall.p95})`,
    `corpus  ${artifacts.length - failed.length}/${artifacts.length} searchable, ${artifacts.filter((artifact) => artifact.status === "partial").length} with incomplete graphs; ${s.missingEvidenceQueries} queries with unmaterialized evidence; ${s.failedQueries} failed queries`,
    ...failed.map((artifact) => `  failed ${artifact.id}: ${artifact.reason ?? "unknown"}`),
    ...unreranked.map((result) => `  unreranked ${result.id}`),
  ].join("\n");
};
