import { FileId, UserId } from "@avenire/contracts";
import * as schema from "@avenire/database/schema";
import { Database, DatabaseError, type DatabaseTransaction } from "@avenire/database/client";
import { expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Effect from "effect/Effect";

import { GraphSearch, GraphSearchLive } from "./search.ts";

const recordingDatabase = (statements: Array<{ sql: string; params: unknown[] }>) => {
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe: (query: string, params: unknown[]) => {
      statements.push({ sql: query, params });
      const rows = query.includes('with "nearest"') ? [["entity", 1]] : [];
      return { values: async () => rows };
    },
  };
  const db = drizzle(client as never, { schema });
  return Database.of({
    db,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(db), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => fn(db as unknown as DatabaseTransaction),
        catch: (cause) => new DatabaseError({ cause }),
      }),
  });
};

it.effect("filters graph seeds, edges and mentions before their limits", () => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const database = recordingDatabase(statements);
  return Effect.gen(function* () {
    const graph = yield* GraphSearch;
    const query = {
      text: "entity",
      fileIds: [FileId.make("selected")],
      since: "2026-10-01T00:00:00Z",
      until: "2026-10-09T00:00:00Z",
    };
    expect(
      yield* graph.search({
        userId: UserId.make("user"),
        text: query.text,
        vector: [1],
        hops: 1,
        limit: 10,
        query,
      }),
    ).toEqual({ chunkIds: [], facts: [] });
    const candidates = statements.filter(({ sql }) => !sql.includes("set_config"));
    expect(candidates).toHaveLength(3);
    for (const rendered of candidates) {
      expect(rendered.sql).toContain('"file"."placement" <>');
      expect(rendered.sql).toContain('"file"."id" in');
      expect(rendered.sql).toContain(
        'coalesce("file"."content_modified_at", "file"."created_at") >=',
      );
      expect(rendered.sql).toContain(
        'coalesce("file"."content_modified_at", "file"."created_at") <',
      );
      expect(rendered.params).toContain("selected");
      expect(rendered.params.some((value) => value instanceof Date)).toBe(true);
    }
    expect(candidates[0]?.sql).toContain('"entity"."embedding" <=>');
    expect(candidates[0]?.sql).toContain("union all");
    expect(candidates[1]?.sql).toContain('"entity_relation"."weight" desc');
    expect(candidates[2]?.sql).toContain("row_number() over");
  }).pipe(Effect.provide(GraphSearchLive), Effect.provideService(Database, database));
});

it.effect("leaves unscoped graph searches free of file joins", () => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const database = recordingDatabase(statements);
  return Effect.gen(function* () {
    const graph = yield* GraphSearch;
    yield* graph.search({
      userId: UserId.make("user"),
      text: "entity",
      vector: [1],
      hops: 1,
      limit: 10,
      query: { text: "entity" },
    });
    const candidates = statements.filter(({ sql }) => !sql.includes("set_config"));
    expect(candidates).toHaveLength(3);
    for (const rendered of candidates) expect(rendered.sql).not.toContain('join "file"');
  }).pipe(Effect.provide(GraphSearchLive), Effect.provideService(Database, database));
});
