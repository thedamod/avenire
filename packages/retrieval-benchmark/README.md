# Retrieval benchmark

Measures document-level recall@10, precision@10, MRR, nDCG@10, and abstentions on a seeded study corpus. Each document is indexed through `ItemIndexer.index`, so contextual embeddings, weighted lexical search, and the graph are exercised.

Run against a migrated development Postgres database with pgvector:

```sh
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench --depth deep
```

## Pinned v1 corpus and scorer

`data/v1/manifest.json` and `data/v1/dataset.json` pin v1's v0.3 contract: 65 artifacts and 84 queries. Corpus bytes go under the ignored `data/v1/.cache/`. Fetch public artifacts, import the local Markdown and Office fixtures, and download the MIT lecture files from MIT OpenCourseWare:

```bash
pnpm --filter @avenire/retrieval-benchmark corpus:fetch
pnpm --filter @avenire/retrieval-benchmark corpus:import-local
pnpm --filter @avenire/retrieval-benchmark corpus:import-mit
pnpm --filter @avenire/retrieval-benchmark corpus:status
```

Use a disposable development PostgreSQL database with pgvector and the provider keys for live runs. `bench:v1` ingests as the dedicated `bench-v1` user, reuses artifacts whose manifest SHA-256 is already indexed, searches queries serially, and writes each JSON run to `data/v1/.cache/runs/`.

```bash
DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --dataset v1 --depth standard
DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --dataset all --depth deep
```

Options are `--depth standard|deep`, `--split all|development|test`, `--dataset v1|extension|all`, `--reingest`, `--corpus-dir <path>`, and `--embedder`, `--reranker`, `--graph`, `--planner` each with `live|test`. Live providers are the defaults. `--reingest` forces extraction and indexing even when bytes match. Query starts are paced 2 seconds apart at standard depth and 4 seconds apart at deep depth; pacing is outside measured search latency, while rate-limit retries are inside it.

`data/v2/extension.json` (`v2-extension-0.2`) adds 94 queries to thin slices: 44 exact-value, 30 unanswerable, and 20 timestamp. Each family is split evenly between development and test. `scripts/generate_extension.py` drafted questions, then `data/v2/CURATION.md` records the manual curation: exact-value needles verified against the corpus, near-corpus unanswerables checked against surrounding chunks, and MIT caption-window timestamps. Keep test queries out of calibration.

To fit abstention, run v1 and extension together with `RETRIEVAL_MIN_RELEVANCE=0`, then pass the run file to the offline sweep. It uses only development queries and chooses the threshold with the best abstention F1 while limiting false abstention of answerable development queries to 5%. The command writes a `-calibrated.json` copy with newly abstained queries scored as empty rankings; its latency measurements remain those of the threshold-0 search.

```bash
RETRIEVAL_MIN_RELEVANCE=0 DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --dataset all --depth standard
pnpm --filter @avenire/retrieval-benchmark bench:calibrate <all-standard-run.json>
RETRIEVAL_MIN_RELEVANCE=<chosen-threshold> DATABASE_URL=<dev-database-url> pnpm --filter @avenire/retrieval-benchmark bench:v1 --dataset v1 --depth deep
pnpm --filter @avenire/retrieval-benchmark bench:summary <all-standard-run-calibrated.json> <v1-deep-run.json>
```

`bench:summary` writes `data/v1/.cache/runs/summary-final.json`, including the v1 published scores, all 84 v1 queries and test-only scores, extension families from the standard run, latency, Cohere HTTP request counts by endpoint, and per-artifact ingestion status, coverage when recorded, and wall time. A `provider-calls-*.json` sidecar survives even if a live run fails before it can write its result. Reused artifacts whose extraction predates the run have unrecorded coverage. The scorer materializes locator-based evidence against the chunks each run actually produced. MRR, nDCG@10, Recall@10, and all-evidence success use v1's metric definitions; abstention and latency are reported alongside them.
