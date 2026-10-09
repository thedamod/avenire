import { ItemId, UserId } from "@avenire/contracts";
import { itemDocumentKey, itemPrefix, itemSourceKey } from "@avenire/storage/keys";
import { Storage, StorageError, StorageMemory } from "@avenire/storage/storage";
import { describe, expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as Effect from "effect/Effect";

import { ARCHIVE_RETENTION_DAYS, archiveCutoff, purgeItem, restoreStatement } from "./archive.ts";

const userId = UserId.make("user");
const itemId = ItemId.make("item");

describe("archive", () => {
  it("computes thirty elapsed days across a calendar boundary", () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
    expect(archiveCutoff(Date.parse("2026-03-01T00:00:00Z"))).toBe(
      Date.parse("2026-01-30T00:00:00Z"),
    );
  });

  it("restores using owned cluster membership and clears the archive timestamp", () => {
    const rendered = new PgDialect().sqlToQuery(restoreStatement(userId, itemId));
    expect(rendered.sql).toContain("ic.item_id = i.id AND ic.user_id = i.user_id");
    expect(rendered.sql).toContain("THEN 'filed' ELSE 'inbox' END");
    expect(rendered.sql).toContain("archived_at = NULL");
    expect(rendered.params).toEqual([itemId, userId]);
  });

  it.effect("removes all item objects before its row and leaves other items alone", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const source = itemSourceKey(userId, itemId, "source.pdf");
      const document = itemDocumentKey(userId, itemId, 1);
      const other = itemSourceKey(userId, ItemId.make("other"), "source.pdf");
      yield* storage.put(source, "source");
      yield* storage.put(document, "document");
      yield* storage.put(other, "other");
      let deleted = false;
      const removed = yield* purgeItem(
        userId,
        itemId,
        Effect.gen(function* () {
          expect(yield* storage.list(itemPrefix(userId, itemId))).toEqual([]);
          deleted = true;
        }),
      );
      expect(removed).toBe(true);
      expect(deleted).toBe(true);
      expect(yield* storage.list(itemPrefix(userId, ItemId.make("other")))).toHaveLength(1);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("retains the row when storage removal fails and supports a subsequent retry", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const key = itemSourceKey(userId, itemId, "source.pdf");
      yield* storage.put(key, "source");
      let deleted = false;
      const deleteRow = Effect.sync(() => {
        deleted = true;
      });
      const failing = Storage.of({
        ...storage,
        remove: (target) =>
          Effect.fail(
            new StorageError({ operation: "remove", key: target, cause: "test failure" }),
          ),
      });
      expect(
        yield* purgeItem(userId, itemId, deleteRow).pipe(Effect.provideService(Storage, failing)),
      ).toBe(false);
      expect(deleted).toBe(false);
      expect(yield* storage.list(itemPrefix(userId, itemId))).toHaveLength(1);
      expect(yield* purgeItem(userId, itemId, deleteRow)).toBe(true);
      expect(deleted).toBe(true);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("retains the row when listing fails", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      let deleted = false;
      const failing = Storage.of({
        ...storage,
        list: () => Effect.fail(new StorageError({ operation: "list", cause: "test failure" })),
      });
      expect(
        yield* purgeItem(
          userId,
          itemId,
          Effect.sync(() => {
            deleted = true;
          }),
        ).pipe(Effect.provideService(Storage, failing)),
      ).toBe(false);
      expect(deleted).toBe(false);
    }).pipe(Effect.provide(StorageMemory)),
  );
});
