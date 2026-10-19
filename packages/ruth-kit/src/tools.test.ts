import { ClusterId, ItemId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { itemSourceKey } from "@avenire/storage/keys";
import { expect, it } from "@effect/vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ctx, fakeDatabase, testCrypto } from "./test-support.ts";
import { ruthKitTools, type RuthKitServices } from "./tools.ts";
import type { TaggedToolError } from "./core.ts";
import type { MetadataCandidate } from "./selectors.ts";

const cache = SemanticCache.of({
  lookupExact: () => Effect.succeed(Option.none()),
  lookupSimilar: () => Effect.succeed(Option.none()),
  store: () => Effect.void,
  invalidate: () => Effect.void,
});
const fileId = ItemId.make("file");
const folder = ClusterId.make("folder");
const inaccessible = fakeDatabase({
  query: {
    item: { findFirst: async () => undefined },
    cluster: { findFirst: async () => undefined },
  },
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
});
for (const name of ["read_file", "write_file", "move_file", "rename_file", "archive_file"] as const)
  it.effect(`${name} rejects unowned ids without running subsequent work`, () => {
    // Missing services and a failing cache invalidation reveal accidental work after an ownership miss.
    const services = Context.make(Database, inaccessible).pipe(
      Context.add(SemanticCache, {
        ...cache,
        invalidate: () => Effect.die("cache must not be invalidated"),
      }),
    ) as Context.Context<RuthKitServices>;
    const program: Effect.Effect<unknown, TaggedToolError, RuthKitServices> =
      name === "read_file"
        ? ruthKitTools.read_file({ fileId }, ctx)
        : name === "write_file"
          ? ruthKitTools.write_file({ title: "Note", content: "private", folder }, ctx)
          : name === "move_file"
            ? ruthKitTools.move_file({ fileId, folder }, ctx)
            : name === "rename_file"
              ? ruthKitTools.rename_file({ fileId, title: "New" }, ctx)
              : ruthKitTools.archive_file({ fileId }, ctx);
    return Effect.gen(function* () {
      expect(yield* program.pipe(Effect.result)).toMatchObject({ failure: { _tag: "NotFound" } });
    }).pipe(Effect.provide(services));
  });
it.effect("writes a Ruth note, folder membership, uploaded event and ingestion job", () => {
  const writes: Array<{ table: string; values: Record<string, unknown> }> = [];
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  let invalidated = 0;
  const database = fakeDatabase({
    query: {
      cluster: { findFirst: async () => ({ id: folder }) },
      item: { findFirst: async () => ({ id: fileId }) },
    },
    insert: (table: { [key: symbol]: unknown }) => ({
      values: (values: Record<string, unknown>) => {
        // Drizzle's table metadata is used only to distinguish recorded writes.
        writes.push({ table: String(table[Symbol.for("drizzle:Name")]), values });
        const result = Promise.resolve([]);
        return Object.assign(result, { onConflictDoUpdate: async () => [] });
      },
    }),
    execute: async (statement: SQL) => {
      statements.push(new PgDialect().sqlToQuery(statement));
      return [{ id: fileId }];
    },
  });
  return Effect.gen(function* () {
    const storage = yield* Storage;
    const services = Context.make(Database, database).pipe(
      Context.add(Storage, storage),
      Context.add(Crypto.Crypto, testCrypto),
      Context.add(SemanticCache, {
        ...cache,
        invalidate: () =>
          Effect.sync(() => {
            invalidated++;
          }),
      }),
    ) as Context.Context<RuthKitServices>;
    const result = yield* ruthKitTools
      .write_file({ title: "Note", content: "# Hello", folder }, ctx)
      .pipe(Effect.provide(services));
    const note = writes.find((write) => write.table === "item");
    expect(note?.values).toMatchObject({
      id: result.fileId,
      userId: ctx.userId,
      source: "ruth",
      placement: "filed",
      kind: "note",
      mimeType: "text/markdown",
      sizeBytes: 7,
    });
    expect(writes.find((write) => write.table === "item_cluster")?.values).toEqual({
      userId: ctx.userId,
      itemId: result.fileId,
      clusterId: folder,
    });
    expect(statements[0]?.sql).toContain("INSERT INTO item_event");
    expect(statements[0]?.params).toContain("uploaded");
    expect(writes.find((write) => write.table === "ingestion_job")?.values).toMatchObject({
      itemId: result.fileId,
      userId: ctx.userId,
      status: "queued",
    });
    expect(
      new TextDecoder().decode(
        yield* storage.get(itemSourceKey(ctx.userId, result.fileId, "note.md")),
      ),
    ).toBe("# Hello");
    expect(invalidated).toBe(1);
  }).pipe(Effect.provide(StorageMemory));
});
it.effect(
  "list_files returns root folders and a stable cursor while inbox excludes membership",
  () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const row = (id: string): MetadataCandidate => ({
      fileId: ItemId.make(id),
      title: "Note",
      kind: "note",
      mimeType: "text/markdown",
      source: "ruth",
      size: null,
      tags: [],
      createdAt: "2026-10-01T00:00:00Z",
      contentModifiedAt: null,
      activityAt: "2026-10-01T00:00:00Z",
      folderName: null,
      events: [],
    });
    const services = Context.make(
      Database,
      fakeDatabase({
        execute: async (statement: SQL) => {
          const rendered = new PgDialect().sqlToQuery(statement);
          statements.push(rendered);
          if (rendered.sql.includes("count(i.id)::int"))
            return [{ clusterId: folder, name: "Folder", itemCount: 2 }];
          return [row("b"), row("a")];
        },
      }),
    ) as Context.Context<RuthKitServices>;
    return Effect.gen(function* () {
      const root = yield* ruthKitTools.list_files({ limit: 1 }, ctx);
      expect(root.folders).toEqual([{ clusterId: folder, name: "Folder", itemCount: 2 }]);
      expect(root.nextCursor).toBe(Buffer.from("b").toString("base64url"));
      const inbox = yield* ruthKitTools.list_files(
        { folder: "inbox", limit: 1, cursor: root.nextCursor! },
        ctx,
      );
      expect(inbox.folders).toEqual([]);
      expect(statements).toHaveLength(3);
      expect(statements[2]?.sql).toContain("NOT EXISTS (SELECT 1 FROM item_cluster");
      expect(statements[2]?.params).toContain("b");
      expect(
        statements.every(
          ({ sql, params }) => sql.includes("archived") && params.includes(ctx.userId),
        ),
      ).toBe(true);
    }).pipe(Effect.provide(services));
  },
);
