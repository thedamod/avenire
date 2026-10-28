import {
  CaptureId,
  SourceUploadId,
  UserId,
  type CaptureSnapshot,
  type CreateSourceUpload,
} from "@avenire/contracts";
import { Database, DatabaseError, makeDatabase } from "@avenire/database/client";
import {
  file,
  fileEvent,
  ingestionJob,
  sourceUpload,
  user,
  userSettings,
} from "@avenire/database/schema";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { and, eq } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { createHash, randomUUID } from "node:crypto";
import { Library, LibraryLive } from "./library.ts";
import { SourceUploads, SourceUploadsLive } from "./sourceUploads.ts";

it.effect(
  "PostgreSQL capture dedupe restores archives, serializes concurrent captures and replaces stubs safely",
  (test) =>
    Effect.gen(function* () {
      const url = yield* Config.option(Config.String("DOMAIN_TEST_DATABASE_URL"));
      if (Option.isNone(url))
        return test.skip(
          "Set DOMAIN_TEST_DATABASE_URL to an isolated migrated PostgreSQL database (through 0013).",
        );
      const connection = yield* Effect.acquireRelease(
        Effect.sync(() => makeDatabase(url.value)),
        ({ sql: client }) => Effect.promise(() => client.end({ timeout: 5 })),
      );
      const database = Database.of({
        db: connection.db,
        use: (fn) =>
          Effect.tryPromise({
            try: () => fn(connection.db),
            catch: (cause) => new DatabaseError({ cause }),
          }),
        useTransaction: (fn) =>
          Effect.tryPromise({
            try: () => connection.db.transaction(fn),
            catch: (cause) => new DatabaseError({ cause }),
          }),
      });
      const owner = UserId.make(randomUUID());
      yield* database.use((db) =>
        db.insert(user).values({
          id: owner,
          name: "Capture fixture",
          email: `${owner}@test`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      yield* Effect.addFinalizer(() =>
        database.use((db) => db.delete(user).where(eq(user.id, owner))).pipe(Effect.orDie),
      );
      yield* Effect.gen(function* () {
        const uploads = yield* SourceUploads;
        const library = yield* Library;
        const storage = yield* Storage;
        const metadata = (
          text: string,
          extra: Partial<CreateSourceUpload> = {},
        ): CreateSourceUpload => ({
          idempotencyKey: randomUUID(),
          title: "Article",
          kind: "web-page",
          mimeType: "text/markdown",
          sizeBytes: Buffer.byteLength(text),
          sha256: createHash("sha256").update(text).digest("hex"),
          ...extra,
        });
        const put = (id: SourceUploadId, text: string) =>
          uploads.put(
            owner,
            id,
            new Request(`https://app.test/api/library/uploads/${id}`, {
              method: "PUT",
              headers: { "content-type": "text/markdown" },
              body: text,
            }),
          );
        const text = "# Article\nThe student can read these bytes.";
        const initial = yield* uploads.create(owner, metadata(text));
        const saved = yield* put(initial.uploadId, text);
        const hit = yield* uploads.create(owner, metadata(text));
        expect(hit).toMatchObject({ status: "completed", file: { id: saved.id } });
        expect(
          yield* database.use((db) => db.select().from(file).where(eq(file.userId, owner))),
        ).toHaveLength(1);
        yield* database.use((db) =>
          db
            .update(file)
            .set({ placement: "archived", archivedAt: new Date(), purgeRequestedAt: new Date() })
            .where(eq(file.id, saved.id)),
        );
        const origin = {
          _tag: "Web" as const,
          url: "https://example.org/article?utm_source=capture",
          title: "Article",
          browser: "chrome" as const,
          capturedAt: "2026-10-26T00:00:00Z",
        };
        const restored = yield* uploads.create(owner, metadata(text, { origin }));
        expect(restored.file).toMatchObject({
          id: saved.id,
          placement: "inbox",
          archivedAt: null,
          origin: { url: "https://example.org/article" },
        });
        const concurrent = yield* Effect.all(
          [uploads.create(owner, metadata(text)), uploads.create(owner, metadata(text))],
          { concurrency: 2 },
        );
        expect(concurrent.map((ticket) => ticket.file?.id)).toEqual([saved.id, saved.id]);
        const otherText = "# Another article\nConcurrent original bytes.";
        const staged = yield* Effect.all(
          [uploads.create(owner, metadata(otherText)), uploads.create(owner, metadata(otherText))],
          { concurrency: 2 },
        );
        expect(staged.every((ticket) => ticket.status === "pending")).toBe(true);
        const completed = yield* Effect.all(
          staged.map((ticket) => put(ticket.uploadId, otherText)),
          { concurrency: 2 },
        );
        expect(completed[0]?.id).toBe(completed[1]?.id);
        const finished = yield* database.use((db) =>
          db.select().from(sourceUpload).where(eq(sourceUpload.userId, owner)),
        );
        const concurrentTickets = finished.filter((row) =>
          staged.some((ticket) => ticket.uploadId === row.id),
        );
        expect(concurrentTickets.every((row) => row.completedFileId === completed[0]!.id)).toBe(
          true,
        );
        expect(concurrentTickets.flatMap((row) => row.abandonedStorageKeys)).toHaveLength(1);

        const snapshot: CaptureSnapshot = {
          id: CaptureId.make(randomUUID()),
          deviceId: "device",
          platform: "linux",
          capturedAt: "2026-10-26T00:00:00Z",
          windows: [],
          media: [],
          collectorNotes: [],
          tabs: [
            {
              tabId: 1,
              windowId: 1,
              browser: "chrome",
              url: "https://example.org/blocked",
              title: "Blocked article",
              activeInWindow: true,
              engagement: { dwellMs: 9000, scrollDepthPct: 20, mediaPlaying: false },
              access: "paywalled",
              summary: "The public abstract.",
            },
          ],
        };
        yield* database.use((db) =>
          db.insert(userSettings).values({
            userId: owner,
            preferences: {
              resultsReadyBy: "07:00",
              timeZone: "UTC",
              fileChanges: "propose",
              sortUnfiledNightly: true,
              captureLoggedInPages: false,
              paywalledPages: "skip",
              notifications: { morningReport: true, needsYou: true, runFailed: true },
            },
          }),
        );
        const skipped = yield* library.submitCapture(owner, {
          ...snapshot,
          id: CaptureId.make(randomUUID()),
        });
        expect(skipped.files).toEqual([]);
        expect(skipped.skipped[0]?.reason).toContain("paywalled");
        yield* database.use((db) => db.delete(userSettings).where(eq(userSettings.userId, owner)));
        const stub = (yield* library.submitCapture(owner, snapshot)).files[0]!;
        expect(stub).toMatchObject({
          access: "paywalled",
          preview: "The public abstract.",
          storageKey: null,
        });
        expect(
          yield* database.use((db) =>
            db.select().from(ingestionJob).where(eq(ingestionJob.fileId, stub.id)),
          ),
        ).toHaveLength(0);
        const recaptured = yield* library.submitCapture(owner, {
          ...snapshot,
          id: CaptureId.make(randomUUID()),
          tabs: [
            { ...snapshot.tabs[0]!, summary: "Updated abstract.", position: { scrollPct: 30 } },
          ],
        });
        expect(recaptured.files[0]).toMatchObject({
          id: stub.id,
          preview: "Updated abstract.",
          origin: { position: { scrollPct: 30 } },
        });
        expect(
          yield* database.use((db) =>
            db.select().from(ingestionJob).where(eq(ingestionJob.fileId, stub.id)),
          ),
        ).toHaveLength(0);
        const accessible = yield* library.submitCapture(owner, {
          ...snapshot,
          id: CaptureId.make(randomUUID()),
          tabs: [{ ...snapshot.tabs[0]!, access: "open" }],
        });
        expect(accessible.files[0]).toMatchObject({ id: stub.id, access: "open" });
        const [retry] = yield* database.use((db) =>
          db.select().from(ingestionJob).where(eq(ingestionJob.fileId, stub.id)),
        );
        expect(retry?.status).toBe("queued");
        const stubOrigin = stub.origin!;
        const replacement = yield* uploads.create(
          owner,
          metadata(text + " New bytes", { origin: stubOrigin }),
        );
        const replaced = yield* put(replacement.uploadId, text + " New bytes");
        expect(replaced).toMatchObject({ id: stub.id, access: "open", preview: null });
        const [job] = yield* database.use((db) =>
          db.select().from(ingestionJob).where(eq(ingestionJob.fileId, stub.id)),
        );
        expect(job?.status).toBe("queued");
        yield* database.use((db) =>
          db
            .update(ingestionJob)
            .set({
              status: "extracting",
              claimToken: "live-claim",
              lockedUntil: new Date(Date.now() + 60000),
            })
            .where(eq(ingestionJob.fileId, stub.id)),
        );
        const again = yield* uploads.create(
          owner,
          metadata(text + " Updated again", { origin: stubOrigin }),
        );
        const refreshed = yield* put(again.uploadId, text + " Updated again");
        expect(refreshed.id).toBe(stub.id);
        const [next] = yield* database.use((db) =>
          db.select().from(ingestionJob).where(eq(ingestionJob.fileId, stub.id)),
        );
        expect(next).toMatchObject({
          generation: job!.generation + 1,
          claimToken: "live-claim",
          status: "queued",
        });
        const [ticket] = yield* database.use((db) =>
          db.select().from(sourceUpload).where(eq(sourceUpload.id, again.uploadId)),
        );
        expect(ticket?.abandonedStorageKeys).toContain(replaced.storageKey);
        yield* uploads.cleanup();
        expect((yield* storage.head(replaced.storageKey!).pipe(Effect.result))._tag).toBe(
          "Failure",
        );
        expect(new TextDecoder().decode(yield* storage.get(refreshed.storageKey!))).toBe(
          text + " Updated again",
        );
        expect(
          (yield* database.use((db) =>
            db.select().from(fileEvent).where(eq(fileEvent.fileId, stub.id)),
          )).every((event) => event.kind === "captured"),
        ).toBe(true);
        // An old hash ticket cannot resolve to a file whose current object now contains different bytes.
        expect((yield* uploads.create(owner, metadata(text + " New bytes"))).status).toBe(
          "pending",
        );
      }).pipe(
        Effect.provide(Layer.mergeAll(SourceUploadsLive, LibraryLive)),
        Effect.provideService(Database, database),
        Effect.provide(StorageMemory),
        Effect.provide(NodeServices.layer),
      );
    }).pipe(Effect.scoped),
);
