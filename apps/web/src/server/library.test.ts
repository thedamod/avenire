import { FileId, UserId } from "@avenire/contracts";
import { Database, type DatabaseClient } from "@avenire/database/client";
import { file } from "@avenire/database/schema";
import { Storage } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Library, LibraryLive } from "./library.ts";

it.effect("Library's real read boundary filters the database by both file and owner", () =>
  Effect.gen(function* () {
    const owner = UserId.make("owner");
    const other = UserId.make("other");
    const id = FileId.make("owned-file");
    const predicates: unknown[][] = [];
    const date = new Date("2026-10-17T00:00:00Z");
    const row = {
      preview: null,
      noteRevision: null,
      archivedViaFolderId: null,
      purgeRequestedAt: null,
      contentHash: null,
      dedupeKey: "fixture",
      documentKey: null,
      extractorVersion: null,
      id,
      userId: owner,
      kind: "note",
      title: "Owner's note",
      source: "upload",
      placement: "inbox",
      tags: [],
      contentModifiedAt: null,
      archivedAt: null,
      purgeStartedAt: null,
      sourceUrl: null,
      storageKey: null,
      mimeType: null,
      sizeBytes: null,
      captureId: null,
      mediaPositionSec: null,
      createdAt: date,
      updatedAt: date,
    } as typeof file.$inferSelect;
    const db = {
      query: {
        file: {
          findFirst: ({ where }: { where: SQL }) => {
            const query = new PgDialect().sqlToQuery(where);
            predicates.push(query.params);
            expect(query.sql).toContain('"file"."user_id"');
            expect(query.sql).toContain('"file"."id"');
            return Promise.resolve(
              query.params.includes(owner) && query.params.includes(id) ? row : undefined,
            );
          },
        },
      },
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }) }),
    } as unknown as DatabaseClient;
    const database = Database.of({
      db,
      use: (fn) => Effect.promise(() => fn(db)),
      useTransaction: () => Effect.die("read must not start a transaction"),
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
    yield* Effect.gen(function* () {
      const library = yield* Library;
      expect((yield* library.getFile(owner, id)).title).toBe("Owner's note");
      expect(yield* library.getFile(other, id).pipe(Effect.result)).toMatchObject({
        failure: { _tag: "NotFound" },
      });
      expect(predicates).toEqual([
        [id, owner],
        [id, other],
      ]);
    }).pipe(Effect.provide(layer));
  }),
);
