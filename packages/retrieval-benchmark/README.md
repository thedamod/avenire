# Retrieval benchmark

Measures document-level recall@10, precision@10, MRR, nDCG@10, and abstentions on a seeded study corpus. Each document is indexed through `ItemIndexer.index`, so contextual embeddings, weighted lexical search, and the graph are exercised.

Run against a migrated development Postgres database with pgvector:

```sh
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench --depth deep
```

## Pinned v1 corpus and scorer

`data/v1/manifest.json` and `data/v1/dataset.json` are the unchanged v0.3 contracts. Corpus bytes live under the ignored `data/v1/.cache/`. The nine local Markdown and Office fixtures must be placed there at the relative paths in the manifest; the seven MIT archive files are not available from v1's importer or the manifest.

```bash
pnpm --filter @avenire/retrieval-benchmark corpus:fetch
pnpm --filter @avenire/retrieval-benchmark corpus:import-local
pnpm --filter @avenire/retrieval-benchmark corpus:import-mit
pnpm --filter @avenire/retrieval-benchmark corpus:status
DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --depth standard
DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --depth deep --reuse-index
```

`bench:v1` ingests into the dedicated `bench-v1` user, reuses items with the same manifest SHA-256, then searches serially and writes a versioned JSON run under `data/v1/.cache/runs/`. `--reuse-index` reads the existing benchmark corpus without repeating provider ingestion, which makes standard and deep search the same chunks. Options: `--depth standard|deep`, `--split all|development|test`, `--reingest`, `--reuse-index`, `--corpus-dir <path>`, `--embedder test|cohere`, `--reranker test|cohere`, `--graph test|gemini`, and `--planner test|gemini`. Live providers are the defaults. Point `DATABASE_URL` at a disposable development database; ingestion writes items, chunks, graph rows, and search cache rows.

Live query starts are paced two seconds apart at standard depth and 4.2 seconds apart at deep depth to stay under provider trial limits. Pacing is outside each query's measured search latency; any rate-limit retry is inside it.

Options: `--embedder test|cohere`, `--reranker test|cohere`, `--graph test|gemini`, `--planner test|gemini`, `--depth standard|deep`, and `--json PATH`. Defaults are offline test providers and standard depth. Cohere and Gemini options require their API keys. Each run replaces only the dedicated `bench-user` corpus. The multi-hop queries require two documents linked by a shared person.

The table averages query scores by query type and across all queries.
Recall@10 is the fraction of relevant documents found; precision@10 is relevant results divided by ten.
MRR rewards the first relevant result's rank, and nDCG@10 rewards relevant documents near the top (with optional graded gains).
Values range from 0 to 1; higher is better. `abstained` counts queries that returned no hits because nothing cleared the relevance threshold.
