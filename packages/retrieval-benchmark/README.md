# Retrieval benchmark

Measures document-level retrieval quality for `@avenire/ingestion/retrieval` on a controlled study corpus.
The corpus covers four subjects and includes paraphrase, keyword, and cross-document queries.

Run from the monorepo root with `DATABASE_URL` pointing to a migrated Postgres database with pgvector:

```sh
pnpm --filter @avenire/retrieval-benchmark bench
pnpm --filter @avenire/retrieval-benchmark bench -- --embedder openai --json /tmp/retrieval.json
```

The default `test` embedder is offline and uses hashed word vectors; `openai` uses the configured live embedding model and requires `OPENAI_API_KEY`.
Each run replaces the dedicated `bench-user` corpus before indexing it.

The table averages query scores by query type and across all queries.
Recall@10 is the fraction of relevant documents found; precision@10 is relevant results divided by ten.
MRR rewards the first relevant result's rank, and nDCG@10 rewards relevant documents near the top (with optional graded gains).
Values range from 0 to 1; higher is better.
