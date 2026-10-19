import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause);
    return `Database query failed: ${detail}`;
  }
}

export type DatabaseClient = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class Database extends Context.Service<
  Database,
  {
    readonly db: DatabaseClient;
    readonly use: <A>(fn: (db: DatabaseClient) => Promise<A>) => Effect.Effect<A, DatabaseError>;
    readonly useTransaction: <A>(
      fn: (tx: DatabaseTransaction) => Promise<A>,
    ) => Effect.Effect<A, DatabaseError>;
  }
>()("avenire/database/Database") {}

export const DatabaseConfig = Config.Redacted("DATABASE_URL");

export const makeDatabase = (
  url: string,
): { readonly sql: ReturnType<typeof postgres>; readonly db: DatabaseClient } => {
  // Notices (e.g. "text-search query contains only stop words") are informational;
  // postgres.js would print them with console.log.
  const sql = postgres(url, { onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }) };
};

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const url = yield* DatabaseConfig;
    const { db } = yield* Effect.acquireRelease(
      Effect.sync(() => makeDatabase(Redacted.value(url))),
      ({ sql }) =>
        Effect.tryPromise(() => sql.end({ timeout: 5 })).pipe(
          Effect.ignore({ log: "Warn", message: "Failed to close the database pool" }),
        ),
    );
    const toError = (cause: unknown) => new DatabaseError({ cause });
    return Database.of({
      db,
      use: (fn) => Effect.tryPromise({ try: () => fn(db), catch: toError }),
      useTransaction: (fn) => Effect.tryPromise({ try: () => db.transaction(fn), catch: toError }),
    });
  }),
);
