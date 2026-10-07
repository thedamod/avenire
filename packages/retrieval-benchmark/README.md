# Retrieval benchmark

Measures document-level recall@10, precision@10, MRR, nDCG@10, and abstentions on a seeded study corpus. Each document is indexed through `ItemIndexer.index`, so contextual embeddings, weighted lexical search, and the graph are exercised.

Run against a migrated development Postgres database with pgvector:

```sh
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench
DATABASE_URL=... pnpm --filter @avenire/retrieval-benchmark bench --depth deep
```

Options: `--embedder test|cohere`, `--reranker test|cohere`, `--graph test|gemini`, `--planner test|gemini`, `--depth standard|deep`, and `--json PATH`. Defaults are offline test providers and standard depth. Cohere and Gemini options require their API keys. Each run replaces only the dedicated `bench-user` corpus. The multi-hop queries require two documents linked by a shared person.

The table averages query scores by query type and across all queries.
Recall@10 is the fraction of relevant documents found; precision@10 is relevant results divided by ten.
MRR rewards the first relevant result's rank, and nDCG@10 rewards relevant documents near the top (with optional graded gains).
Values range from 0 to 1; higher is better. `abstained` counts queries that returned no hits because nothing cleared the relevance threshold.
