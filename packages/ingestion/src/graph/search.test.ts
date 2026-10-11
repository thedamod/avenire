import { FileId, UserId } from "@avenire/contracts";
import {
  Database,
  DatabaseError,
  type DatabaseClient,
  type DatabaseTransaction,
} from "@avenire/database/client";
import { expect, it } from "@effect/vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as Effect from "effect/Effect";

import { GraphSearch, GraphSearchLive } from "./search.ts";

const recordingDatabase = (statements: Array<{ sql: string; params: unknown[] }>) => {
  const client = {
    execute: async (statement: SQL) => {
      const rendered = new PgDialect().sqlToQuery(statement);
      statements.push(rendered);
      return rendered.sql.includes("WITH nearest") ? [{ id: "entity", score: 1 }] : [];
    },
  } as unknown as DatabaseClient;
  return Database.of({
    db: client,
    use: (fn) =>
      Effect.tryPromise({ try: () => fn(client), catch: (cause) => new DatabaseError({ cause }) }),
    useTransaction: (fn) =>
      Effect.tryPromise({
        try: () => fn(client as unknown as DatabaseTransaction),
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
      expect(rendered.sql).toContain("i.placement <> 'archived'");
      expect(rendered.sql).toContain("AND i.id IN (");
      expect(rendered.sql).toMatch(
        /coalesce\(i.content_modified_at, i.created_at\) >= \$\d+::timestamptz/u,
      );
      expect(rendered.sql).toMatch(
        /coalesce\(i.content_modified_at, i.created_at\) < \$\d+::timestamptz/u,
      );
      expect(rendered.params).toContain("selected");
      expect(rendered.params).toContain(query.since);
      expect(rendered.params).toContain(query.until);
    }
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
    for (const rendered of candidates) expect(rendered.sql).not.toContain("JOIN file");
  }).pipe(Effect.provide(GraphSearchLive), Effect.provideService(Database, database));
});
