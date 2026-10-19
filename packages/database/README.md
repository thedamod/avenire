# @avenire/database

Drizzle schema, migrations and the `Database` Effect service.

The development database is `avenirev2`. `drizzle.config.ts` loads `DATABASE_URL` from the
gitignored repo-root `.env.local`, the single env file for the monorepo. Never point v2
migrations at the v1 `avenire` database or the benchmark databases.

1. After editing `src/schema.ts`: `pnpm db:generate`
2. Apply migrations: `pnpm db:migrate`

The first migration installs pgvector (version 0.8 or later for iterative HNSW scans)
and pg_trgm, so a fresh database needs no separate extension step.
