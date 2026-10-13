import { FileId, UserId } from "@avenire/contracts";
import { fileDocumentKey, filePrefix, fileSourceKey } from "@avenire/storage/keys";
import { Storage, StorageError, StorageMemory } from "@avenire/storage/storage";
import { describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@avenire/database/schema";
import * as Effect from "effect/Effect";

import { ARCHIVE_RETENTION_DAYS, archiveCutoff, purgeFile, restoreStatement } from "./archive.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");

describe("archive", () => {
  it("computes thirty elapsed days across a calendar boundary", () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
    expect(archiveCutoff(Date.parse("2026-03-01T00:00:00Z"))).toBe(
      Date.parse("2026-01-30T00:00:00Z"),
    );
  });

  it("restores using owned folder membership and clears the archive timestamp", () => {
    const rendered = restoreStatement(drizzle.mock({ schema }), userId, fileId).toSQL();
    expect(rendered.sql).toContain("file_folder");
    expect(rendered.sql).toContain("case when exists");
    expect(rendered.sql).toContain("archived_at");
    expect(rendered.params).toEqual([null, fileId, userId]);
  });

  it.effect("removes all file objects before its row and leaves other files alone", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const source = fileSourceKey(userId, fileId, "source.pdf");
      const document = fileDocumentKey(userId, fileId, 1, "abcdef012345");
      const other = fileSourceKey(userId, FileId.make("other"), "source.pdf");
      yield* storage.put(source, "source");
      yield* storage.put(document, "document");
      yield* storage.put(other, "other");
      let deleted = false;
      const removed = yield* purgeFile(
        userId,
        fileId,
        Effect.gen(function* () {
          expect(yield* storage.list(filePrefix(userId, fileId))).toEqual([]);
          deleted = true;
        }),
      );
      expect(removed).toBe(true);
      expect(deleted).toBe(true);
      expect(yield* storage.list(filePrefix(userId, FileId.make("other")))).toHaveLength(1);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("retains the row when storage removal fails and supports a subsequent retry", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      const key = fileSourceKey(userId, fileId, "source.pdf");
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
        yield* purgeFile(userId, fileId, deleteRow).pipe(Effect.provideService(Storage, failing)),
      ).toBe(false);
      expect(deleted).toBe(false);
      expect(yield* storage.list(filePrefix(userId, fileId))).toHaveLength(1);
      expect(yield* purgeFile(userId, fileId, deleteRow)).toBe(true);
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
        yield* purgeFile(
          userId,
          fileId,
          Effect.sync(() => {
            deleted = true;
          }),
        ).pipe(Effect.provideService(Storage, failing)),
      ).toBe(false);
      expect(deleted).toBe(false);
    }).pipe(Effect.provide(StorageMemory)),
  );
});
