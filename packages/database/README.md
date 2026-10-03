# @avenire/database

Drizzle schema, migrations and the `Database` Effect service.

1. Enable pgvector (>= 0.8, for iterative HNSW scans used by retrieval) once per database:
   `psql "$DATABASE_URL" -f src/sql/extensions.sql`
2. After editing `src/schema.ts`: `pnpm db:generate`
3. Apply migrations: `pnpm db:migrate`
