import { FileId, UserId } from "@avenire/contracts";
import * as schema from "@avenire/database/schema";
import { Database, DatabaseError } from "@avenire/database/client";
import { fileDocumentKey, filePrefix, fileSourceKey } from "@avenire/storage/keys";
import { Storage, StorageError, StorageMemory } from "@avenire/storage/storage";
import { describe, expect, it } from "@effect/vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import * as Effect from "effect/Effect";

import {
  ARCHIVE_RETENTION_DAYS,
  archiveCutoff,
  archiveFile,
  restoreFile,
  collectExpiredTranscripts,
  claimPurgeStatement,
  restoreStatement,
} from "./archive.ts";
import { makeFilePurger } from "./purge.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");
const cutoff = new Date(archiveCutoff(Date.parse("2026-10-17T00:00:00Z")));

/** Deterministic row model through the real Drizzle adapter; PostgreSQL locking is tested separately. */
const fixture = () => {
  const state = {
    placement: "archived",
    claimed: false,
    deleted: false,
    archivedAt: cutoff.getTime() - 1,
  };
  const queries: string[] = [];
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe: (statement: string, params: unknown[]) => {
      queries.push(statement);
      let rows: string[][] = [];
      if (statement.includes('"purge_started_at" = coalesce')) {
        if (
          !state.deleted &&
          params[0] === fileId &&
          params[1] === userId &&
          state.placement === "archived" &&
          (state.claimed || state.archivedAt < cutoff.getTime())
        ) {
          state.claimed = true;
          rows = [[fileId]];
        }
      } else if (statement.includes("case when exists")) {
        if (
          !state.deleted &&
          params.at(-2) === fileId &&
          params.at(-1) === userId &&
          !state.claimed
        ) {
          state.placement = "inbox";
          rows = [[fileId]];
        }
      } else throw new Error(`Unexpected archive query: ${statement}`);
      const result = Promise.resolve(rows);
      return Object.assign(result, { values: () => result });
    },
  };
  const db = drizzle({ client: client as never, schema });
  const purge = makeFilePurger({
    claim: (owner, id) =>
      Effect.promise(async () => (await claimPurgeStatement(db, owner, id, cutoff)).length > 0),
    complete: () =>
      Effect.sync(() => {
        if (!state.claimed || state.deleted) return false;
        state.deleted = true;
        return true;
      }),
  });
  const restore = Effect.promise(() => restoreStatement(db, userId, fileId));
  return { state, queries, purge, restore };
};

describe("archive", () => {
  it("computes thirty elapsed days across a calendar boundary", () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
    expect(archiveCutoff(Date.parse("2026-03-01T00:00:00Z"))).toBe(
      Date.parse("2026-01-30T00:00:00Z"),
    );
  });

  it("guards restore by owner and irreversible claim while preserving membership", () => {
    const rendered = restoreStatement(drizzle.mock({ schema }), userId, fileId).toSQL();
    expect(rendered.sql).toContain("case when exists");
    expect(rendered.sql).toContain('"file_folder"."user_id" = "file"."user_id"');
    expect(rendered.sql).toContain('"file"."purge_started_at" is null');
    expect(rendered.params).toEqual([userId, null, null, null, fileId, userId]);
    expect(rendered.sql).toContain('"folder"."archived_at" is null');
  });

  it("claims only owned archived expired rows, or resumes an existing claim", () => {
    const rendered = claimPurgeStatement(drizzle.mock({ schema }), userId, fileId, cutoff).toSQL();
    expect(rendered.sql).toContain('coalesce("file"."purge_started_at", now())');
    expect(rendered.sql).toContain('"file"."placement" =');
    expect(rendered.sql).toContain(
      '"file"."purge_started_at" is not null or "file"."purge_requested_at" <= now() or "file"."archived_at" <',
    );
    expect(rendered.params).toEqual([fileId, userId, "archived", cutoff.toISOString()]);
  });

  it.effect("claims before storage access and rejects an interleaved restore", () =>
    Effect.gen(function* () {
      const model = fixture();
      const storage = yield* Storage;
      const source = fileSourceKey(userId, fileId, "source.pdf");
      const document = fileDocumentKey(userId, fileId, 1, "abcdef012345");
      const other = fileSourceKey(userId, FileId.make("other"), "source.pdf");
      yield* storage.put(source, "source");
      yield* storage.put(document, "document");
      yield* storage.put(other, "other");
      const observing = Storage.of({
        ...storage,
        list: (prefix) =>
          Effect.gen(function* () {
            expect(model.state.claimed).toBe(true);
            expect(model.state.deleted).toBe(false);
            expect(yield* model.restore).toEqual([]);
            return [...(yield* storage.list(prefix)), { key: other, size: 5 }];
          }),
      });
      expect(
        yield* model.purge(userId, fileId).pipe(Effect.provideService(Storage, observing)),
      ).toBe(true);
      expect(model.state.deleted).toBe(true);
      expect(yield* storage.list(filePrefix(userId, fileId))).toEqual([]);
      expect(yield* storage.list(filePrefix(userId, FileId.make("other")))).toHaveLength(1);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("does no storage work when restore wins the race or owner/retention is invalid", () =>
    Effect.gen(function* () {
      const storage = yield* Storage;
      let listed = 0;
      const observing = Storage.of({
        ...storage,
        list: () =>
          Effect.sync(() => {
            listed++;
            return [];
          }),
      });
      const model = fixture();
      expect(yield* model.restore).toEqual([{ id: fileId }]);
      expect(
        yield* model.purge(userId, fileId).pipe(Effect.provideService(Storage, observing)),
      ).toBe(false);
      const expired = fixture();
      expect(
        yield* expired
          .purge(UserId.make("other"), fileId)
          .pipe(Effect.provideService(Storage, observing)),
      ).toBe(false);
      expired.state.archivedAt = cutoff.getTime();
      expect(
        yield* expired.purge(userId, fileId).pipe(Effect.provideService(Storage, observing)),
      ).toBe(false);
      expect(listed).toBe(0);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("preserves its claim after partial deletion and resumes without allowing restore", () =>
    Effect.gen(function* () {
      const model = fixture();
      const storage = yield* Storage;
      yield* storage.put(fileSourceKey(userId, fileId, "source.pdf"), "source");
      yield* storage.put(fileDocumentKey(userId, fileId, 1, "abcdef012345"), "document");
      let removals = 0;
      const failing = Storage.of({
        ...storage,
        remove: (key) =>
          ++removals === 2
            ? Effect.fail(new StorageError({ operation: "remove", key, cause: "test failure" }))
            : storage.remove(key),
      });
      expect(yield* model.purge(userId, fileId).pipe(Effect.provideService(Storage, failing))).toBe(
        false,
      );
      expect(model.state.claimed).toBe(true);
      expect(model.state.deleted).toBe(false);
      expect(yield* model.restore).toEqual([]);
      expect(yield* storage.list(filePrefix(userId, fileId))).toHaveLength(1);
      // A retry remains eligible even if retention data changes after the irreversible claim.
      model.state.archivedAt = cutoff.getTime() + 1;
      expect(yield* model.purge(userId, fileId)).toBe(true);
      expect(model.state.deleted).toBe(true);
      expect(yield* storage.list(filePrefix(userId, fileId))).toEqual([]);
    }).pipe(Effect.provide(StorageMemory)),
  );

  it.effect("retains the claim when listing fails", () =>
    Effect.gen(function* () {
      const model = fixture();
      const storage = yield* Storage;
      const failing = Storage.of({
        ...storage,
        list: () => Effect.fail(new StorageError({ operation: "list", cause: "test failure" })),
      });
      expect(yield* model.purge(userId, fileId).pipe(Effect.provideService(Storage, failing))).toBe(
        false,
      );
      expect(model.state.claimed).toBe(true);
      expect(model.state.deleted).toBe(false);
      expect(yield* model.restore).toEqual([]);
    }).pipe(Effect.provide(StorageMemory)),
  );
});

describe("archive derivative transaction and expiry GC", () => {
  const databaseFixture = (claimed = false) => {
    const operations: string[] = [];
    const client = {
      options: { parsers: {}, serializers: {} },
      unsafe: (statement: string) => {
        operations.push(statement);
        const result = Promise.resolve(
          statement.startsWith('update "file"')
            ? claimed
              ? []
              : [[fileId]]
            : statement.startsWith('select "id" from "file"') && claimed
              ? [[fileId]]
              : [],
        );
        return Object.assign(result, { values: () => result });
      },
      begin: async <A>(callback: (tx: unknown) => Promise<A>) => {
        operations.push("BEGIN");
        const result = await callback(client);
        operations.push("COMMIT");
        return result;
      },
    };
    const db = drizzle({ client: client as never, schema });
    return {
      operations,
      database: Database.of({
        db,
        use: (fn) =>
          Effect.tryPromise({ try: () => fn(db), catch: (cause) => new DatabaseError({ cause }) }),
        useTransaction: (fn) =>
          Effect.tryPromise({
            try: () => db.transaction(fn),
            catch: (cause) => new DatabaseError({ cause }),
          }),
      }),
    };
  };

  it.effect("erases source transcripts before committing archive and corpus invalidation", () => {
    const model = databaseFixture();
    return archiveFile(userId, fileId).pipe(
      Effect.provideService(Database, model.database),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(model.operations[0]).toBe("BEGIN");
          expect(model.operations[1]).toMatch(/from "user".*for update/);
          expect(model.operations[2]).toContain('update "file"');
          expect(model.operations[3]).toContain('delete from "transcript_cache"');
          expect(model.operations[3]).toContain('"transcript_cache"."file_id" =');
          expect(model.operations[3]).toContain('"transcript_cache"."user_id" =');
          expect(model.operations[4]).toContain('update "folder"');
          expect(model.operations[5]).toContain('"corpus_revision" + 1');
          expect(model.operations.at(-1)).toBe("COMMIT");
        }),
      ),
    );
  });

  it.effect("reports an explicit conflict for an owned claimed file", () => {
    const model = databaseFixture(true);
    return restoreFile(userId, fileId).pipe(
      Effect.provideService(Database, model.database),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("Conflict");
          expect(model.operations.at(-2)).toContain('"file"."purge_started_at" is not null');
          expect(model.operations.at(-1)).toBe("COMMIT");
        }),
      ),
    );
  });

  it.effect("physically collects expired transcripts in bounded skip-locked batches", () => {
    const model = databaseFixture();
    return collectExpiredTranscripts().pipe(
      Effect.provideService(Database, model.database),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(model.operations).toHaveLength(1);
          expect(model.operations[0]).toContain('delete from "transcript_cache"');
          expect(model.operations[0]).toContain('"transcript_cache"."expires_at" <= now()');
          expect(model.operations[0]).toContain("limit $1");
          expect(model.operations[0]).toContain("for update skip locked");
        }),
      ),
    );
  });
});
