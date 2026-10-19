import { FileId, UserId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import * as schema from "@avenire/database/schema";
import { describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import {
  TranscriptCache,
  TranscriptCacheLive,
  TranscriptCacheTest,
  TRANSCRIPT_CACHE_TTL_MS,
} from "./transcript-cache.ts";

const scope = { userId: UserId.make("owner"), fileId: FileId.make("source") };
const audio = new Uint8Array([1, 2, 3]);
const segments = [{ text: "x = 42", startSec: 0, endSec: 1 }];

/** Executes production Drizzle queries against a deterministic adapter, without a database/provider. */
const fixture = () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const state = {
    owner: "owner",
    file: "source",
    exists: true,
    archived: false,
    purging: false,
    placement: "inbox",
    now: 0,
    afterUserLock: () => {},
  };
  const entries = new Map<string, { segments: typeof segments; expiresAt: number }>();
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe: (statement: string, params: unknown[]) => {
      queries.push({ sql: statement, params });
      let rows: unknown[][] = [];
      if (statement.startsWith('select "id" from "user"')) {
        state.afterUserLock();
        rows = [[state.owner]];
      } else if (statement.startsWith('select "id" from "file"')) {
        if (
          state.exists &&
          params[0] === state.file &&
          params[1] === state.owner &&
          !state.archived &&
          !state.purging &&
          state.placement !== "archived"
        )
          rows = [[state.file]];
      } else if (statement.startsWith('insert into "transcript_cache"')) {
        entries.set(JSON.stringify(params.slice(0, 4)), {
          segments: JSON.parse(String(params[4])),
          expiresAt: state.now + TRANSCRIPT_CACHE_TTL_MS,
        });
      } else if (statement.startsWith('select "transcript_cache"."segments"')) {
        const [model, hash, owner, file] = params;
        const entry = entries.get(JSON.stringify([owner, file, model, hash]));
        if (
          entry &&
          entry.expiresAt > state.now &&
          state.exists &&
          owner === state.owner &&
          file === state.file &&
          !state.archived &&
          !state.purging &&
          state.placement !== "archived"
        )
          rows = [[entry.segments]];
      } else throw new Error(`Unexpected transcript query: ${statement}`);
      const result = Promise.resolve(rows);
      return Object.assign(result, { values: () => result });
    },
    begin: async <A>(callback: (tx: unknown) => Promise<A>) => callback(client),
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
  return { state, queries, entries, database };
};

// Provide the actual persistent implementation with an isolated adapter for each test.
const withFixture = <A, E>(
  model: ReturnType<typeof fixture>,
  program: Effect.Effect<A, E, TranscriptCache>,
) =>
  program.pipe(
    Effect.provide(TranscriptCacheLive),
    Effect.provideService(Database, model.database),
  );

describe("transcript cache ownership and lifetime", () => {
  it.effect("unowned extraction neither reads nor persists plaintext", () => {
    const model = fixture();
    return withFixture(
      model,
      Effect.gen(function* () {
        const cache = yield* TranscriptCache;
        yield* cache.store("model", audio, segments);
        expect(yield* cache.lookup("model", audio)).toBeUndefined();
        expect(model.queries).toEqual([]);
      }),
    );
  });

  it.effect(
    "locks user then source before storing; isolates owner, source, model and exact bytes",
    () => {
      const model = fixture();
      return withFixture(
        model,
        Effect.gen(function* () {
          const cache = yield* TranscriptCache;
          yield* cache.store("model", audio, segments, scope);
          expect(model.queries[0]!.sql).toMatch(/from "user".*for update/);
          expect(model.queries[1]!.sql).toMatch(/from "file".*for update/);
          expect(model.queries[1]!.sql).toContain('"file"."purge_started_at" is null');
          expect(model.queries[1]!.sql).toContain('"file"."archived_at" is null');
          expect(model.queries[1]!.params).toEqual([scope.fileId, scope.userId, "archived"]);
          expect(model.queries[2]!.sql).toContain("interval '24 hours'");
          expect(model.queries[2]!.sql).toContain(
            'on conflict ("user_id","file_id","model","content_hash")',
          );
          expect(yield* cache.lookup("model", audio, scope)).toEqual(segments);
          expect(
            yield* cache.lookup("model", audio, { ...scope, userId: UserId.make("other") }),
          ).toBeUndefined();
          expect(
            yield* cache.lookup("model", audio, { ...scope, fileId: FileId.make("other") }),
          ).toBeUndefined();
          expect(yield* cache.lookup("other-model", audio, scope)).toBeUndefined();
          expect(yield* cache.lookup("model", new Uint8Array([1, 2, 4]), scope)).toBeUndefined();
          const query = model.queries[3]!;
          expect(query.sql).toContain('"file"."user_id" = "transcript_cache"."user_id"');
          expect(query.sql).toContain('"transcript_cache"."expires_at" > now()');
        }),
      );
    },
  );

  it.effect("expires at exactly 24 hours and refreshes TTL on a successful owned store", () => {
    const model = fixture();
    return withFixture(
      model,
      Effect.gen(function* () {
        const cache = yield* TranscriptCache;
        yield* cache.store("model", audio, segments, scope);
        model.state.now = TRANSCRIPT_CACHE_TTL_MS - 1;
        expect(yield* cache.lookup("model", audio, scope)).toEqual(segments);
        model.state.now++;
        expect(yield* cache.lookup("model", audio, scope)).toBeUndefined();
        yield* cache.store("model", audio, segments, scope);
        expect(yield* cache.lookup("model", audio, scope)).toEqual(segments);
      }),
    );
  });

  for (const condition of ["archived", "purging", "placement", "missing", "other-owner"]) {
    it.effect(`rejects a store when ${condition} changes before the source lock`, () => {
      const model = fixture();
      model.state.afterUserLock = () => {
        if (condition === "archived") model.state.archived = true;
        if (condition === "purging") model.state.purging = true;
        if (condition === "placement") model.state.placement = "archived";
        if (condition === "missing") model.state.exists = false;
        if (condition === "other-owner") model.state.owner = "other";
      };
      return withFixture(
        model,
        Effect.gen(function* () {
          const cache = yield* TranscriptCache;
          yield* cache.store("model", audio, segments, scope);
          expect(model.queries).toHaveLength(2);
          expect(model.entries.size).toBe(0);
        }),
      );
    });
  }

  it.effect("does not expose preexisting cache rows after archive or purge claim", () => {
    const model = fixture();
    return withFixture(
      model,
      Effect.gen(function* () {
        const cache = yield* TranscriptCache;
        yield* cache.store("model", audio, segments, scope);
        model.state.archived = true;
        expect(yield* cache.lookup("model", audio, scope)).toBeUndefined();
        model.state.archived = false;
        model.state.purging = true;
        expect(yield* cache.lookup("model", audio, scope)).toBeUndefined();
      }),
    );
  });

  it.effect("the test layer also isolates sources and observes the exact expiry boundary", () =>
    Effect.gen(function* () {
      const cache = yield* TranscriptCache;
      yield* cache.store("model", audio, segments, scope);
      expect(yield* cache.lookup("model", audio, scope)).toEqual(segments);
      expect(
        yield* cache.lookup("model", audio, { ...scope, fileId: FileId.make("other") }),
      ).toBeUndefined();
      yield* TestClock.adjust(TRANSCRIPT_CACHE_TTL_MS);
      expect(yield* cache.lookup("model", audio, scope)).toBeUndefined();
    }).pipe(Effect.provide(TranscriptCacheTest)),
  );
});
