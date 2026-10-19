import { CanvasNodeId, FileId, UserId, type CanvasNode } from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { Storage } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Library, LibraryLive } from "./library.ts";

const owner = UserId.make("owner");
const node: CanvasNode = {
  id: CanvasNodeId.make("node"),
  ref: { _tag: "file", fileId: FileId.make("foreign-file") },
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};
const fixture = () => {
  const predicates: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  let deletes = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          const query = new PgDialect().sqlToQuery(where);
          predicates.push(query);
          const result = Promise.resolve(query.sql.includes('"file"') ? [] : [{ id: owner }]);
          return Object.assign(result, { for: () => result });
        },
      }),
    }),
    delete: () => {
      deletes++;
      return { where: () => Promise.resolve() };
    },
  } as unknown as DatabaseClient;
  const database = Database.of({
    db,
    use: (fn) => Effect.promise(() => fn(db)),
    useTransaction: (fn) => Effect.promise(() => fn(db as never)),
  });
  const layer = LibraryLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Database, database),
        Layer.succeed(Storage, {} as Storage["Service"]),
        NodeServices.layer,
      ),
    ),
  );
  return { layer, predicates, deletes: () => deletes };
};

it.effect("canvas replacement rejects another owner's reference before deleting saved nodes", () =>
  Effect.gen(function* () {
    const f = fixture();
    const result = yield* Effect.gen(function* () {
      return yield* (yield* Library).saveCanvas(owner, [node]).pipe(Effect.result);
    }).pipe(Effect.provide(f.layer));
    expect(result).toMatchObject({ failure: { _tag: "Conflict" } });
    expect(f.deletes()).toBe(0);
    expect(f.predicates.at(-1)?.params).toEqual(["foreign-file", "owner"]);
  }),
);

it.effect("duplicate canvas IDs are rejected before touching the database", () =>
  Effect.gen(function* () {
    const f = fixture();
    const result = yield* Effect.gen(function* () {
      return yield* (yield* Library).saveCanvas(owner, [node, node]).pipe(Effect.result);
    }).pipe(Effect.provide(f.layer));
    expect(result).toMatchObject({ failure: { _tag: "Conflict" } });
    expect(f.predicates).toEqual([]);
    expect(f.deletes()).toBe(0);
  }),
);
