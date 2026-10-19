import { type SearchResult, UserId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import * as schema from "@avenire/database/schema";
import { expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { randomBytes } from "node:crypto";

import { Embedder } from "../embed.ts";
import { SemanticCache, SemanticCacheLive } from "./cache.ts";

const userId = UserId.make("owner");
const result: SearchResult = {
  hits: [],
  facts: [],
  aspects: [],
  reranked: true,
  abstained: true,
  cached: false,
};
const fixture = () => {
  let revision = 1;
  let storedRevision: number | undefined;
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const client: unknown = {
    options: { parsers: {}, serializers: {} },
    unsafe: (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      const execute = async () => {
        if (sql.startsWith('select "id" from "user"')) return [[userId]];
        if (sql.includes('"corpus_revision"') && sql.includes('from "user"')) return [[revision]];
        if (sql.startsWith('insert into "search_cache"')) {
          storedRevision = revision;
          return [];
        }
        if (sql.startsWith('select "id", "result"'))
          return params[1] === revision && storedRevision === revision
            ? [["cache", result, 0]]
            : [];
        return [];
      };
      const pending = execute();
      return Object.assign(pending, { values: () => pending });
    },
    begin: <A>(callback: (client: unknown) => Promise<A>) => callback(client),
  };
  const db = drizzle({ client: client as never, schema });
  const database = Database.of({
    db,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(db), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => db.transaction(fn),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  });
  const crypto = Crypto.make({
    randomBytes: (size) => new Uint8Array(randomBytes(size)),
    digest: () => Effect.die("unused"),
  });
  const embedder = Embedder.of({
    model: "model",
    embedQueries: () => Effect.succeed([]),
    embedDocuments: () => Effect.succeed([]),
  });
  return {
    queries,
    mutate: () => {
      revision += 1;
    },
    run: <A, E>(effect: Effect.Effect<A, E, SemanticCache>) =>
      effect.pipe(
        Effect.provide(SemanticCacheLive),
        Effect.provideService(Database, database),
        Effect.provideService(Embedder, embedder),
        Effect.provideService(Crypto.Crypto, crypto),
      ),
  };
};

it.effect(
  "rejects a stale search store after a canonical revision change, even without deletion",
  () => {
    const state = fixture();
    return state.run(
      Effect.gen(function* () {
        const cache = yield* SemanticCache;
        const oldKey = { userId, corpusRevision: 1, optionsKey: "options" };
        yield* cache.store(oldKey, { queryText: "question", vector: [1], result });
        expect(Option.isSome(yield* cache.lookupExact(oldKey, "question"))).toBe(true);
        // Barrier: the search has captured oldKey; a mutation commits before its store resumes.
        state.mutate();
        const storesBefore = state.queries.filter((query) =>
          query.sql.startsWith('insert into "search_cache"'),
        ).length;
        yield* cache.store(oldKey, { queryText: "question", vector: [1], result });
        expect(
          state.queries.filter((query) => query.sql.startsWith('insert into "search_cache"')),
        ).toHaveLength(storesBefore);
        expect(Option.isNone(yield* cache.lookupExact(oldKey, "question"))).toBe(true);
        const newKey = { ...oldKey, corpusRevision: 2 };
        expect(Option.isNone(yield* cache.lookupExact(newKey, "question"))).toBe(true);
        yield* cache.store(newKey, { queryText: "question", vector: [1], result });
        expect(Option.isSome(yield* cache.lookupExact(newKey, "question"))).toBe(true);
        const lookup = state.queries.find((query) =>
          query.sql.startsWith('select "id", "result"'),
        )!;
        expect(lookup.sql).toContain('"search_cache"."corpus_revision" =');
        expect(lookup.sql).toContain('SELECT "user"."corpus_revision"');
        expect(lookup.sql).toContain('"search_cache"."user_id" =');
      }),
    );
  },
);
