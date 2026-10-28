import { WidgetHost } from "./widgetHost.ts";
import { AuthService } from "@avenire/auth/server";
import { CreateSourceUpload, StorageKey, UserId } from "@avenire/contracts";
import { Database, DatabaseError, makeDatabase } from "@avenire/database/client";
import { file, fileEvent, ingestionJob, sourceUpload, user } from "@avenire/database/schema";
import { Storage, StorageError, StorageMemory } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { and, eq, inArray } from "drizzle-orm";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SourceUploads,
  SourceUploadsLive,
  normalizeUploadMetadata,
  spoolSource,
} from "./sourceUploads.ts";
import {
  cancelUploadResponse,
  completeUploadResponse,
  createUploadResponse,
  putUploadResponse,
} from "./sourceUploadHttp.ts";

const content = "The device transfers source bytes; the server indexes them.";
const bytes = new TextEncoder().encode(content);
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const metadata = (): CreateSourceUpload => ({
  idempotencyKey: randomUUID(),
  title: "Acquired note",
  kind: "note",
  mimeType: "text/plain",
  sizeBytes: bytes.byteLength,
  sha256: hash(bytes),
});
const request = (body: Uint8Array | string = bytes, signal?: AbortSignal) =>
  new Request("https://app.test/api/library/uploads/ticket", {
    method: "PUT",
    headers: { "content-type": "text/plain", cookie: "session=owner" },
    body: typeof body === "string" ? body : new Uint8Array(body),
    signal: signal ?? null,
  });

it.effect("upload metadata rejects secret-bearing extra fields and canonicalizes provenance", () =>
  Effect.sync(() => {
    const input = { ...metadata(), sourceUrl: "https://study.test/chapter?session=secret#token" };
    expect(normalizeUploadMetadata(input).sourceUrl).toBe("https://study.test/chapter");
    expect(() =>
      normalizeUploadMetadata({ ...input, sourceUrl: "https://owner:secret@study.test/chapter" }),
    ).toThrow();
    expect(() =>
      normalizeUploadMetadata({ ...input, sourceUrl: "file:///home/device/private.pdf" }),
    ).toThrow();
    expect(() => normalizeUploadMetadata({ ...metadata(), kind: "image" })).toThrow();
    for (const extra of [
      { storageKey: "other/source" },
      { cookies: "session=secret" },
      { headers: { authorization: "secret" } },
      { path: "/home/device/private.pdf" },
    ])
      expect(
        Schema.decodeUnknownOption(CreateSourceUpload)(
          { ...metadata(), ...extra },
          { onExcessProperty: "error" },
        )._tag,
      ).toBe("None");
  }),
);

it.effect(
  "source bytes spool incrementally to private disk, enforcing count, hash and cancellation",
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "upload-test-"))),
        (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
      );
      const path = yield* spoolSource(request(), directory, metadata());
      expect(yield* Effect.promise(() => readFile(path, "utf8"))).toBe(content);
      for (const [body, expected] of [
        ["truncated", 422],
        [new Uint8Array(bytes.byteLength + 1), 422],
      ] as const) {
        const child = yield* Effect.promise(() => mkdtemp(join(directory, "invalid-")));
        expect(
          yield* spoolSource(request(body), child, metadata()).pipe(Effect.result),
        ).toMatchObject({ failure: { status: expected } });
      }
      const child = yield* Effect.promise(() => mkdtemp(join(directory, "hash-")));
      expect(
        yield* spoolSource(request(), child, { ...metadata(), sha256: "0".repeat(64) }).pipe(
          Effect.result,
        ),
      ).toMatchObject({ failure: { status: 422 } });
      const controller = new AbortController();
      let cancelled = false;
      const pending = new Request("https://app.test/upload", {
        method: "PUT",
        signal: controller.signal,
        headers: { "content-type": "text/plain" },
        body: new ReadableStream({
          start(stream) {
            stream.enqueue(bytes.slice(0, 1));
            setTimeout(() => controller.abort(), 10);
          },
          cancel() {
            cancelled = true;
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const cancelledDirectory = yield* Effect.promise(() =>
        mkdtemp(join(directory, "cancelled-")),
      );
      expect(
        yield* spoolSource(pending, cancelledDirectory, metadata()).pipe(Effect.result),
      ).toMatchObject({ failure: { status: 400 } });
      expect(cancelled).toBe(true);
    }).pipe(Effect.scoped),
);

it.effect(
  "upload HTTP guards reject forged sessions, cross-site mutation and secret metadata before service access",
  () =>
    Effect.gen(function* () {
      const auth = AuthService.of({
        auth: {} as AuthService["Service"]["auth"],
        getSession: (headers) =>
          Effect.succeed(
            headers.get("cookie") === "session=owner"
              ? { id: UserId.make("owner"), email: "owner@test", name: "Owner" }
              : null,
          ),
      });
      const id = randomUUID();
      const absent = SourceUploads.of({
        create: () => Effect.die("create must not execute"),
        complete: () => Effect.die("complete must not execute"),
        prepare: () => Effect.die("prepare must not execute"),
        put: () => Effect.die("put must not execute"),
        cancel: () => Effect.die("cancel must not execute"),
        cleanup: () => Effect.void,
      });
      for (const operation of [
        completeUploadResponse(
          new Request("https://app.test/api/library/uploads/ticket", {
            method: "POST",
            headers: { cookie: "forged" },
          }),
          id,
        ),
        createUploadResponse(
          new Request("https://app.test/api/library/uploads", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(metadata()),
          }),
        ),
        putUploadResponse(
          new Request("https://app.test/api/library/uploads/ticket", {
            method: "PUT",
            headers: { cookie: "forged" },
            body: bytes,
          }),
          id,
        ),
        cancelUploadResponse(
          new Request("https://app.test/api/library/uploads/ticket", {
            method: "DELETE",
            headers: { cookie: "forged" },
          }),
          id,
        ),
      ])
        expect(
          (yield* operation.pipe(
            Effect.provideService(AuthService, auth),
            Effect.provideService(SourceUploads, absent),
          )).status,
        ).toBe(401);
      const crossSite = yield* putUploadResponse(
        new Request("https://app.test/api/library/uploads/ticket", {
          method: "PUT",
          headers: { cookie: "session=owner", origin: "https://attacker.test" },
          body: bytes,
        }),
        id,
      ).pipe(
        Effect.provideService(AuthService, auth),
        Effect.provideService(SourceUploads, absent),
      );
      expect(crossSite.status).toBe(403);
      const secrets = yield* createUploadResponse(
        new Request("https://app.test/api/library/uploads", {
          method: "POST",
          headers: { cookie: "session=owner", "content-type": "application/json" },
          body: JSON.stringify({ ...metadata(), storageKey: "private", cookies: "secret" }),
        }),
      ).pipe(
        Effect.provideService(AuthService, auth),
        Effect.provideService(SourceUploads, absent),
      );
      expect(secrets.status).toBe(400);
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ BETTER_AUTH_URL: "https://app.test" }),
      ),
      Effect.provideService(WidgetHost, { host: "widgets.test" }),
    ),
);

it.effect(
  "upload routes reject widget-host POST/PUT/DELETE before authentication or domain access",
  () =>
    Effect.gen(function* () {
      const auth = AuthService.of({
        auth: {} as AuthService["Service"]["auth"],
        getSession: () => Effect.die("Widget-host requests must not authenticate"),
      });
      const absent = SourceUploads.of({
        create: () => Effect.die("No domain access"),
        complete: () => Effect.die("complete must not execute"),
        prepare: () => Effect.die("prepare must not execute"),
        put: () => Effect.die("No domain access"),
        cancel: () => Effect.die("No domain access"),
        cleanup: () => Effect.void,
      });
      const id = randomUUID();
      for (const method of ["POST", "PUT", "DELETE"]) {
        for (const url of [
          "https://widgets.test/api/library/uploads",
          "https://app.test/api/library/uploads",
        ]) {
          const request = new Request(url, {
            method,
            headers: {
              host: "widgets.test",
              cookie: "session=owner",
              origin: "https://attacker.test",
            },
          });
          const operation =
            method === "POST"
              ? createUploadResponse(request)
              : method === "PUT"
                ? putUploadResponse(request, id)
                : cancelUploadResponse(request, id);
          const response = yield* operation.pipe(
            Effect.provideService(AuthService, auth),
            Effect.provideService(SourceUploads, absent),
          );
          expect(response.status).toBe(404);
          expect(yield* Effect.promise(() => response.text())).toBe("");
        }
      }
    }).pipe(Effect.provideService(WidgetHost, { host: "widgets.test" })),
);

it.effect(
  "real PostgreSQL upload lifecycle fences owners/retries and publishes only verified bytes atomically",
  (test) =>
    Effect.gen(function* () {
      const url = yield* Config.option(Config.String("DOMAIN_TEST_DATABASE_URL"));
      if (Option.isNone(url))
        return test.skip(
          "Set DOMAIN_TEST_DATABASE_URL to an isolated migrated PostgreSQL database.",
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
      const other = UserId.make(randomUUID());
      yield* database.use((db) =>
        db.insert(user).values(
          [owner, other].map((id) => ({
            id,
            name: "Upload fixture",
            email: `${id}@upload.test`,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        ),
      );
      yield* Effect.addFinalizer(() =>
        database
          .use((db) => db.delete(user).where(inArray(user.id, [owner, other])))
          .pipe(Effect.orDie),
      );
      yield* Effect.gen(function* () {
        const memory = yield* Storage;
        let canSign = false;
        let failPut = false;
        let failRemove = false;
        let beginPut: (() => void) | undefined;
        let releasePut: (() => void) | undefined;
        const stored = Storage.of({
          ...memory,
          prepareSourceUpload: (key) =>
            Effect.succeed(
              canSign
                ? {
                    method: "PUT" as const,
                    url: `https://bucket.test/provider-test?key=${key}`,
                  }
                : null,
            ),
          remove: (key) =>
            failRemove
              ? Effect.fail(new StorageError({ operation: "remove", cause: "storage outage" }))
              : memory.remove(key),
          put: (key, body, options) =>
            Effect.gen(function* () {
              if (failPut)
                return yield* new StorageError({ operation: "put", cause: "storage outage" });
              if (beginPut) {
                beginPut();
                beginPut = undefined;
                yield* Effect.promise(
                  () =>
                    new Promise<void>((resolve) => {
                      releasePut = resolve;
                    }),
                );
              }
              return yield* memory.put(key, body, options);
            }),
        });
        yield* Effect.gen(function* () {
          const uploads = yield* SourceUploads;
          const directBytes = new TextEncoder().encode("direct source fixture");
          const directInput = {
            ...metadata(),
            sizeBytes: directBytes.length,
            sha256: hash(directBytes),
          };
          const direct = yield* uploads.create(owner, directInput);
          const protocol = (body: unknown) =>
            completeUploadResponse(
              new Request(`https://app.test/api/library/uploads/${direct.uploadId}`, {
                method: "POST",
                headers: { "content-type": "application/json", cookie: "session=owner" },
                body: JSON.stringify(body),
              }),
              direct.uploadId,
            ).pipe(
              Effect.provideService(
                AuthService,
                AuthService.of({
                  auth: {} as AuthService["Service"]["auth"],
                  getSession: () =>
                    Effect.succeed({ id: owner, email: "owner@test", name: "Owner" }),
                }),
              ),
              Effect.provideService(WidgetHost, { host: "widgets.test" }),
              Effect.provideService(
                ConfigProvider.ConfigProvider,
                ConfigProvider.fromUnknown({ BETTER_AUTH_URL: "https://app.test" }),
              ),
            );
          const relay = yield* protocol({
            op: "presign",
            files: [{ name: "source", size: directBytes.length, type: directInput.mimeType }],
          });
          expect(yield* Effect.promise(() => relay.json())).toMatchObject({
            uploads: [{ target: { method: "PUT", url: direct.uploadUrl } }],
          });
          canSign = true;
          const presigned = yield* protocol({
            op: "presign",
            files: [{ name: "source", size: directBytes.length, type: directInput.mimeType }],
          });
          expect(presigned.status).toBe(200);
          expect(yield* Effect.promise(() => presigned.json())).toMatchObject({
            uploads: [{ id: direct.uploadId, key: direct.uploadId, target: { method: "PUT" } }],
          });
          expect(
            (yield* protocol({
              op: "presign",
              files: [{ name: "source", size: directBytes.length + 1, type: directInput.mimeType }],
            })).status,
          ).toBe(422);
          expect(
            (yield* protocol({
              op: "complete",
              completions: [{ id: direct.uploadId, key: randomUUID() }],
            })).status,
          ).toBe(400);
          const target = yield* uploads.prepare(owner, direct.uploadId, {
            size: directBytes.length,
            type: directInput.mimeType,
          });
          expect(target?.method).toBe("PUT");
          expect(
            yield* uploads.prepare(owner, direct.uploadId, {
              size: directBytes.length,
              type: directInput.mimeType,
            }),
          ).toEqual(target);
          expect(
            yield* uploads
              .prepare(other, direct.uploadId, {
                size: directBytes.length,
                type: directInput.mimeType,
              })
              .pipe(Effect.result),
          ).toMatchObject({ failure: { status: 404 } });
          expect(
            yield* uploads
              .prepare(owner, direct.uploadId, {
                size: directBytes.length + 1,
                type: directInput.mimeType,
              })
              .pipe(Effect.result),
          ).toMatchObject({ failure: { status: 422 } });
          const [directRow] = yield* database.use((db) =>
            db.select().from(sourceUpload).where(eq(sourceUpload.id, direct.uploadId)),
          );
          // Provider writes happen out of band. Completion must not call the relay put.
          yield* memory.put(StorageKey.make(directRow!.storageKey!), "corrupt");
          expect(
            yield* uploads.complete(owner, direct.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 422 } });
          yield* memory.put(StorageKey.make(directRow!.storageKey!), directBytes);
          failPut = true;
          const directFile = yield* uploads.complete(owner, direct.uploadId, request());
          expect((yield* uploads.complete(owner, direct.uploadId, request())).id).toBe(
            directFile.id,
          );
          expect(
            yield* uploads.complete(other, direct.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 404 } });
          const completed = yield* protocol({
            op: "complete",
            completions: [{ id: direct.uploadId, key: direct.uploadId }],
          });
          expect(completed.status).toBe(200);
          expect(yield* Effect.promise(() => completed.json())).toMatchObject({
            files: [{ key: direct.uploadId, size: directBytes.length }],
            sourceFile: { id: directFile.id },
          });
          failPut = false;
          yield* memory.remove(StorageKey.make(directRow!.storageKey!));
          yield* database.use((db) => db.delete(file).where(eq(file.id, directFile.id)));
          yield* database.use((db) =>
            db.delete(sourceUpload).where(eq(sourceUpload.id, direct.uploadId)),
          );
          const input = {
            ...metadata(),
            sourceUrl: "https://study.test/chapter?token=secret#fragment",
          };
          // Stage lifecycle tickets before publishing identical bytes; later creates dedupe.
          const expired = yield* uploads.create(owner, metadata());
          const cancelled = yield* uploads.create(owner, metadata());
          const reclaimed = yield* uploads.create(owner, metadata());
          const concurrent = yield* uploads.create(owner, metadata());
          const created = yield* uploads.create(owner, input);
          expect(created.uploadUrl).toBe(`/api/library/uploads/${created.uploadId}`);
          expect(yield* uploads.create(owner, input)).toEqual(created);
          expect(
            yield* uploads.create(owner, { ...input, title: "Different" }).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 409 } });
          expect(
            yield* uploads.put(other, created.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 404 } });
          expect(yield* uploads.cancel(other, created.uploadId).pipe(Effect.result)).toMatchObject({
            failure: { status: 404 },
          });
          expect(
            yield* database.use((db) => db.select().from(file).where(eq(file.userId, owner))),
          ).toHaveLength(0);
          expect(
            yield* uploads.put(owner, created.uploadId, request("wrong")).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 422 } });
          expect(
            yield* database.use((db) =>
              db.select().from(ingestionJob).where(eq(ingestionJob.userId, owner)),
            ),
          ).toHaveLength(0);
          failPut = true;
          expect(
            yield* uploads.put(owner, created.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 500 } });
          failPut = false;
          const uploaded = yield* uploads.put(owner, created.uploadId, request());
          expect(uploaded).toMatchObject({
            title: input.title,
            source: "upload",
            kind: "note",
            sizeBytes: bytes.byteLength,
            sourceUrl: "https://study.test/chapter",
          });
          expect(new TextDecoder().decode(yield* memory.get(uploaded.storageKey!))).toBe(content);
          expect((yield* uploads.put(owner, created.uploadId, request())).id).toBe(uploaded.id);
          expect(
            yield* database.use((db) =>
              db.select().from(fileEvent).where(eq(fileEvent.fileId, uploaded.id)),
            ),
          ).toHaveLength(1);
          expect(
            yield* database.use((db) =>
              db.select().from(ingestionJob).where(eq(ingestionJob.fileId, uploaded.id)),
            ),
          ).toHaveLength(1);
          expect(yield* uploads.cancel(owner, created.uploadId).pipe(Effect.result)).toMatchObject({
            failure: { status: 409 },
          });
          yield* database.use((db) =>
            db
              .update(sourceUpload)
              .set({ expiresAt: new Date(-2 * 60 * 60 * 1000) })
              .where(eq(sourceUpload.id, created.uploadId)),
          );
          yield* uploads.cleanup();
          const [cleaned] = yield* database.use((db) =>
            db.select().from(sourceUpload).where(eq(sourceUpload.id, created.uploadId)),
          );
          expect(cleaned?.abandonedStorageKeys).toEqual([]);

          yield* database.use((db) =>
            db
              .update(sourceUpload)
              .set({ expiresAt: new Date(-2 * 60 * 60 * 1000) })
              .where(eq(sourceUpload.id, expired.uploadId)),
          );
          expect(
            yield* uploads.put(owner, expired.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 410 } });
          yield* uploads.cleanup();
          yield* uploads.cancel(owner, cancelled.uploadId);
          expect(
            yield* uploads.put(owner, cancelled.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 410 } });

          // A dead worker lease is reclaimable; failed garbage deletion stays durable.
          const oldKey = `users/${owner}/files/reclaimed/source`;
          yield* memory.put(StorageKey.make(oldKey), "abandoned source");
          yield* database.use((db) =>
            db
              .update(sourceUpload)
              .set({
                status: "uploading",
                claimToken: randomUUID(),
                claimExpiresAt: new Date(0),
                storageKey: oldKey,
              })
              .where(eq(sourceUpload.id, reclaimed.uploadId)),
          );
          const recovered = yield* uploads.put(owner, reclaimed.uploadId, request());
          expect(recovered.storageKey).not.toBe(oldKey);
          failRemove = true;
          expect(yield* uploads.cleanup().pipe(Effect.result)).toMatchObject({
            failure: { status: 500 },
          });
          const [queuedCleanup] = yield* database.use((db) =>
            db.select().from(sourceUpload).where(eq(sourceUpload.id, reclaimed.uploadId)),
          );
          expect(queuedCleanup?.abandonedStorageKeys).toContain(oldKey);
          failRemove = false;
          yield* database.use((db) =>
            db
              .update(sourceUpload)
              .set({ expiresAt: new Date(-2 * 60 * 60 * 1000) })
              .where(eq(sourceUpload.id, reclaimed.uploadId)),
          );
          yield* uploads.cleanup();
          expect(yield* memory.head(StorageKey.make(oldKey)).pipe(Effect.result)).toMatchObject({
            failure: { _tag: "ObjectNotFound" },
          });
          expect(new TextDecoder().decode(yield* memory.get(recovered.storageKey!))).toBe(content);

          const started = new Promise<void>((resolve) => {
            beginPut = resolve;
          });
          const fiber = yield* uploads
            .put(owner, concurrent.uploadId, request())
            .pipe(Effect.forkChild);
          yield* Effect.promise(() => started);
          expect(
            yield* uploads.put(owner, concurrent.uploadId, request()).pipe(Effect.result),
          ).toMatchObject({ failure: { status: 409 } });
          yield* uploads.cancel(owner, concurrent.uploadId);
          releasePut!();
          const result = yield* Fiber.join(fiber).pipe(Effect.result);
          expect(result).toMatchObject({ failure: { status: 409 } });
          yield* uploads.cleanup();
          expect(
            yield* database.use((db) =>
              db
                .select()
                .from(file)
                .where(
                  and(eq(file.userId, owner), eq(file.dedupeKey, `upload:${concurrent.uploadId}`)),
                ),
            ),
          ).toHaveLength(0);
        }).pipe(Effect.provide(SourceUploadsLive), Effect.provideService(Storage, stored));
      }).pipe(
        Effect.provideService(Database, database),
        Effect.provide(StorageMemory),
        Effect.provide(NodeServices.layer),
      );
    }).pipe(Effect.scoped),
);

it.effect("web page snapshots accept markdown originals", () =>
  Effect.sync(() => {
    expect(
      normalizeUploadMetadata({ ...metadata(), kind: "web-page", mimeType: "text/markdown" }),
    ).toMatchObject({ kind: "web-page", mimeType: "text/markdown", access: "open" });
  }),
);
