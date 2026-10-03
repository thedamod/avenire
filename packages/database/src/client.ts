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
}) {}

export type DatabaseClient = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class Database extends Context.Service<Database, {
  readonly db: DatabaseClient;
  readonly use: <A>(fn: (db: DatabaseClient) => Promise<A>) => Effect.Effect<A, DatabaseError>;
  readonly useTransaction: <A>(fn: (tx: DatabaseTransaction) => Promise<A>) => Effect.Effect<A, DatabaseError>;
}>()("avenire/database/Database") {}

export const DatabaseConfig = Config.Redacted("DATABASE_URL");

export const makeDatabase = (url: string): { readonly sql: ReturnType<typeof postgres>; readonly db: DatabaseClient } => {
  const sql = postgres(url);
  return { sql, db: drizzle(sql, { schema }) };
};

export const DatabaseLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const url = yield* DatabaseConfig;
    const { sql, db } = yield* Effect.acquireRelease(
      Effect.sync(() => makeDatabase(Redacted.value(url))),
      ({ sql }) => Effect.promise(() => sql.end({ timeout: 5 })).pipe(Effect.ignore),
    );
    const mapError = (cause: unknown) => new DatabaseError({ cause });
    return Database.of({
      db,
      use: (fn) => Effect.tryPromise({ try: () => fn(db), catch: mapError }),
      useTransaction: (fn) => Effect.tryPromise({
        try: () => db.transaction(fn),
        catch: mapError,
      }),
    });
  }),
);
