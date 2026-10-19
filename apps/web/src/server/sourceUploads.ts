/** Durable owned upload tickets. Only verified complete source bytes become library rows. */
import {
  CreateSourceUpload,
  FileEventId,
  FileId,
  IngestionJobId,
  MAX_SOURCE_UPLOAD_BYTES,
  SourceUploadError,
  SourceUploadId,
  StorageKey,
  type LibraryFile,
  type SourceUploadTicket,
  type UserId,
} from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { lockCorpus } from "@avenire/database/corpus";
import { file, fileEvent, sourceUpload, type SourceUploadRow } from "@avenire/database/schema";
import { enqueueIngestionTx } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { fileSourceKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Schedule from "effect/Schedule";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileToContract } from "./library.ts";

export const UPLOAD_TTL_MS = 60 * 60 * 1000;
export const UPLOAD_LEASE_MS = 15 * 60 * 1000;
const reject = (status: number, message: string) => new SourceUploadError({ status, message });
const failure = (cause: unknown) =>
  cause instanceof SourceUploadError
    ? cause
    : cause instanceof DatabaseError && cause.cause instanceof SourceUploadError
      ? cause.cause
      : reject(500, "The upload could not be completed.");
const formats: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  document: [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-excel",
    "application/rtf",
    "text/rtf",
  ],
  "web-page": ["text/html", "application/xhtml+xml"],
  note: ["text/plain", "text/markdown"],
  selection: ["text/plain", "text/markdown"],
  image: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/tiff",
    "image/bmp",
    "image/heic",
    "image/heif",
  ],
  audio: [
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
    "audio/aac",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/ogg"],
};
const mime = (value: string) => value.split(";", 1)[0]!.trim().toLowerCase();
export const normalizeUploadMetadata = (input: CreateSourceUpload): CreateSourceUpload => {
  const title = input.title.trim();
  const mimeType = mime(input.mimeType);
  if (
    !title ||
    [...title].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw reject(400, "A valid title is required.");
  if (!formats[input.kind]?.includes(mimeType))
    throw reject(415, "This file type and MIME type are not supported.");
  let sourceUrl: string | undefined;
  if (input.sourceUrl !== undefined) {
    const url = URL.parse(input.sourceUrl);
    if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
      throw reject(400, "Source provenance must be an HTTP URL without credentials.");
    url.search = "";
    url.hash = "";
    sourceUrl = url.toString();
  }
  return {
    ...input,
    title,
    mimeType,
    sha256: input.sha256.toLowerCase(),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
  };
};
const ticket = (row: SourceUploadRow): SourceUploadTicket => ({
  uploadId: SourceUploadId.make(row.id),
  uploadUrl: `/api/library/uploads/${row.id}`,
  expiresAt: row.expiresAt.toISOString(),
  status: row.status,
});
const sameMetadata = (row: SourceUploadRow, input: CreateSourceUpload) =>
  row.title === input.title &&
  row.kind === input.kind &&
  row.mimeType === input.mimeType &&
  row.sizeBytes === input.sizeBytes &&
  row.sha256 === input.sha256 &&
  row.sourceUrl === (input.sourceUrl ?? null);

/** Bounded disk spool with incremental hash. No full source payload is buffered in memory. */
export const spoolSource = (
  request: Request,
  directory: string,
  metadata: { sizeBytes: number; sha256: string; mimeType: string },
) =>
  Effect.tryPromise({
    try: async () => {
      if (mime(request.headers.get("content-type") ?? "") !== metadata.mimeType)
        throw reject(415, "Content-Type must match the upload ticket.");
      const length = request.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) !== metadata.sizeBytes))
        throw reject(422, "The upload size does not match its ticket.");
      if (request.headers.has("content-encoding"))
        throw reject(415, "Encoded upload bodies are not supported.");
      const reader = request.body?.getReader();
      if (!reader) throw reject(422, "Source bytes are required.");
      const path = join(directory, "source");
      const handle = await open(path, "wx", 0o600);
      const hash = createHash("sha256");
      let size = 0;
      let timedOut = false;
      const abort = () => {
        void reader.cancel().catch(() => undefined);
      };
      request.signal.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(() => {
        timedOut = true;
        abort();
      }, UPLOAD_LEASE_MS);
      try {
        if (request.signal.aborted) throw reject(400, "The upload was cancelled.");
        while (true) {
          // eslint-disable-next-line no-await-in-loop -- Backpressure and strict streamed size accounting.
          const { value, done } = await reader.read();
          if (timedOut) throw reject(408, "The upload transfer exceeded its time limit.");
          if (request.signal.aborted) throw reject(400, "The upload was cancelled.");
          if (done) break;
          size += value.byteLength;
          if (size > MAX_SOURCE_UPLOAD_BYTES)
            throw reject(413, "Source bytes exceed the upload limit.");
          if (size > metadata.sizeBytes)
            throw reject(422, "The upload size does not match its ticket.");
          hash.update(value);
          // eslint-disable-next-line no-await-in-loop -- Keep disk writes bounded to one chunk.
          await handle.writeFile(value);
        }
        if (size !== metadata.sizeBytes || hash.digest("hex") !== metadata.sha256)
          throw reject(422, "Source size or SHA-256 does not match the upload ticket.");
        return path;
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", abort);
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
        await handle.close();
      }
    },
    catch: failure,
  });

export class SourceUploads extends Context.Service<
  SourceUploads,
  {
    readonly create: (
      userId: UserId,
      input: CreateSourceUpload,
    ) => Effect.Effect<SourceUploadTicket, SourceUploadError>;
    readonly put: (
      userId: UserId,
      id: SourceUploadId,
      request: Request,
    ) => Effect.Effect<LibraryFile, SourceUploadError>;
    readonly cancel: (userId: UserId, id: SourceUploadId) => Effect.Effect<void, SourceUploadError>;
    readonly cleanup: () => Effect.Effect<void, SourceUploadError>;
  }
>()("avenire/web/SourceUploads") {}

export const SourceUploadsLive = Layer.effect(
  SourceUploads,
  Effect.gen(function* () {
    const database = yield* Database;
    const storage = yield* Storage;
    const crypto = yield* Crypto.Crypto;
    const uuid = crypto.randomUUIDv4;
    const now = DateTime.nowAsDate;
    const readFile = (userId: UserId, id: string) =>
      database
        .use(async (db) => {
          const [row] = await db
            .select()
            .from(file)
            .where(and(eq(file.id, id), eq(file.userId, userId)))
            .limit(1);
          if (!row) throw reject(404, "The uploaded file is unavailable.");
          return fileToContract(row);
        })
        .pipe(Effect.mapError(failure));
    const cleanKeys = Effect.fn("SourceUploads.cleanKeys")(function* (row: SourceUploadRow) {
      const at = yield* now;
      for (const key of row.abandonedStorageKeys) {
        yield* storage.remove(StorageKey.make(key));
        // Keep deletion tombstones through the lease window: a crashed/stale writer may
        // finish a remote PUT after the first delete. Future sweeps delete it again.
        if (row.expiresAt.getTime() + UPLOAD_LEASE_MS > at.getTime()) continue;
        yield* database.use((db) =>
          db
            .update(sourceUpload)
            .set({
              abandonedStorageKeys: sql`array_remove(${sourceUpload.abandonedStorageKeys}, ${key})`,
            })
            .where(eq(sourceUpload.id, row.id)),
        );
      }
    });
    const abandonClaim = (userId: UserId, id: string, token: string, key: string) =>
      database.useTransaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(sourceUpload)
          .where(and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)))
          .for("update");
        if (!row || (row.status === "completed" && row.storageKey === key)) return;
        await tx
          .update(sourceUpload)
          .set({
            ...(row.claimToken === token
              ? {
                  status: "pending" as const,
                  claimToken: null,
                  claimExpiresAt: null,
                  storageKey: null,
                }
              : {}),
            abandonedStorageKeys: [...new Set([...row.abandonedStorageKeys, key])],
            updatedAt: sql`now()`,
          })
          .where(eq(sourceUpload.id, id));
      });

    return SourceUploads.of({
      create: Effect.fn("SourceUploads.create")(function* (userId, input) {
        const decoded = yield* Schema.decodeUnknownEffect(CreateSourceUpload)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => reject(400, "Invalid upload metadata.")));
        const metadata = yield* Effect.try({
          try: () => normalizeUploadMetadata(decoded),
          catch: failure,
        });
        const id = yield* uuid;
        const fileId = yield* newId(FileId).pipe(Effect.provideService(Crypto.Crypto, crypto));
        const at = yield* now;
        const row = yield* database.useTransaction(async (tx) => {
          await tx
            .insert(sourceUpload)
            .values({
              ...metadata,
              sourceUrl: metadata.sourceUrl ?? null,
              id,
              userId,
              fileId,
              status: "pending",
              expiresAt: new Date(at.getTime() + UPLOAD_TTL_MS),
            })
            .onConflictDoNothing({ target: [sourceUpload.userId, sourceUpload.idempotencyKey] });
          const [row] = await tx
            .select()
            .from(sourceUpload)
            .where(
              and(
                eq(sourceUpload.userId, userId),
                eq(sourceUpload.idempotencyKey, metadata.idempotencyKey),
              ),
            )
            .limit(1);
          if (!row || !sameMetadata(row, metadata))
            throw reject(409, "This idempotency key belongs to different upload metadata.");
          if (row.status !== "completed" && (row.status === "cancelled" || row.expiresAt <= at))
            throw reject(410, "This upload ticket is no longer available.");
          return row;
        });
        return ticket(row);
      }, Effect.mapError(failure)),
      put: Effect.fn("SourceUploads.put")(function* (userId, id, request) {
        const token = yield* uuid;
        const at = yield* now;
        const claim = yield* database.useTransaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(sourceUpload)
            .where(and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)))
            .for("update");
          if (!row) throw reject(404, "Upload ticket not found.");
          if (row.status === "completed") return { row, completed: true as const };
          if (row.status === "cancelled" || row.expiresAt <= at)
            throw reject(410, "This upload ticket has expired or was cancelled.");
          if (row.status === "uploading" && row.claimExpiresAt !== null && row.claimExpiresAt > at)
            throw reject(409, "This upload is already in progress.");
          const key = fileSourceKey(
            userId,
            FileId.make(row.fileId),
            "source",
            token.replaceAll("-", "").slice(-12),
          );
          const [updated] = await tx
            .update(sourceUpload)
            .set({
              status: "uploading",
              claimToken: token,
              claimExpiresAt: new Date(at.getTime() + UPLOAD_LEASE_MS),
              storageKey: key,
              abandonedStorageKeys:
                row.storageKey === null
                  ? row.abandonedStorageKeys
                  : [...row.abandonedStorageKeys, row.storageKey],
              updatedAt: at,
            })
            .where(eq(sourceUpload.id, id))
            .returning();
          return { row: updated!, completed: false as const };
        });
        if (claim.completed)
          return yield* readFile(userId, claim.row.completedFileId ?? claim.row.fileId);
        const row = claim.row;
        const key = StorageKey.make(row.storageKey!);
        const upload = Effect.acquireUseRelease(
          Effect.tryPromise({
            try: () => mkdtemp(join(tmpdir(), "avenire-source-")),
            catch: failure,
          }),
          (directory) =>
            Effect.gen(function* () {
              const path = yield* spoolSource(request, directory, row);
              const blob = yield* Effect.tryPromise({
                try: () => openAsBlob(path, { type: row.mimeType }),
                catch: failure,
              });
              yield* storage
                .put(key, blob, { contentType: row.mimeType })
                .pipe(Effect.uninterruptible);
              const jobId = yield* newId(IngestionJobId).pipe(
                Effect.provideService(Crypto.Crypto, crypto),
              );
              const eventId = yield* newId(FileEventId).pipe(
                Effect.provideService(Crypto.Crypto, crypto),
              );
              const finishedAt = yield* now;
              return yield* database.useTransaction(async (tx) => {
                await lockCorpus(tx, userId);
                const [current] = await tx
                  .select()
                  .from(sourceUpload)
                  .where(and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)))
                  .for("update");
                if (
                  !current ||
                  current.status !== "uploading" ||
                  current.claimToken !== token ||
                  current.expiresAt <= finishedAt ||
                  current.claimExpiresAt === null ||
                  current.claimExpiresAt <= finishedAt ||
                  request.signal.aborted
                )
                  throw reject(409, "This upload no longer owns its completion lease.");
                const [saved] = await tx
                  .insert(file)
                  .values({
                    id: FileId.make(row.fileId),
                    userId,
                    title: row.title,
                    kind: row.kind,
                    source: "upload",
                    dedupeKey: `upload:${id}`,
                    sourceUrl: row.sourceUrl,
                    storageKey: key,
                    mimeType: row.mimeType,
                    sizeBytes: row.sizeBytes,
                  })
                  .returning();
                await tx
                  .insert(fileEvent)
                  .values({ id: eventId, userId, fileId: row.fileId, kind: "uploaded" });
                await enqueueIngestionTx(tx, userId, FileId.make(row.fileId), jobId);
                await tx
                  .update(sourceUpload)
                  .set({
                    status: "completed",
                    completedFileId: row.fileId,
                    claimToken: null,
                    claimExpiresAt: null,
                    updatedAt: finishedAt,
                  })
                  .where(eq(sourceUpload.id, id));
                return fileToContract(saved!);
              });
            }),
          (directory) =>
            Effect.tryPromise({
              try: () => rm(directory, { recursive: true, force: true }),
              catch: failure,
            }).pipe(Effect.ignore({ log: "Error", message: "Source spool cleanup failed" })),
        );
        return yield* upload.pipe(
          Effect.onError(() =>
            abandonClaim(userId, id, token, key).pipe(
              Effect.ignore({ log: "Error", message: "Upload claim release failed" }),
            ),
          ),
          Effect.mapError(failure),
        );
      }, Effect.mapError(failure)),
      cancel: Effect.fn("SourceUploads.cancel")(function* (userId, id) {
        const row = yield* database.useTransaction(async (tx) => {
          const [row] = await tx
            .select()
            .from(sourceUpload)
            .where(and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)))
            .for("update");
          if (!row) throw reject(404, "Upload ticket not found.");
          if (row.status === "completed")
            throw reject(409, "A completed upload cannot be cancelled.");
          const [updated] = await tx
            .update(sourceUpload)
            .set({
              status: "cancelled",
              claimToken: null,
              claimExpiresAt: null,
              storageKey: null,
              abandonedStorageKeys:
                row.storageKey === null
                  ? row.abandonedStorageKeys
                  : [...row.abandonedStorageKeys, row.storageKey],
              updatedAt: sql`now()`,
            })
            .where(eq(sourceUpload.id, id))
            .returning();
          return updated!;
        });
        yield* cleanKeys(row);
      }, Effect.mapError(failure)),
      cleanup: Effect.fn("SourceUploads.cleanup")(function* () {
        const at = yield* now;
        const rows = yield* database.useTransaction(async (tx) => {
          const rows = await tx
            .select()
            .from(sourceUpload)
            .where(
              or(
                sql`cardinality(${sourceUpload.abandonedStorageKeys}) > 0`,
                and(
                  inArray(sourceUpload.status, ["pending", "uploading"]),
                  lt(sourceUpload.expiresAt, at),
                ),
                and(eq(sourceUpload.status, "uploading"), lt(sourceUpload.claimExpiresAt, at)),
              ),
            )
            .orderBy(asc(sourceUpload.updatedAt))
            .limit(100)
            .for("update", { skipLocked: true });
          const cleanup: SourceUploadRow[] = [];
          for (const row of rows) {
            const expired = row.expiresAt <= at;
            const stale =
              row.status === "uploading" && row.claimExpiresAt !== null && row.claimExpiresAt <= at;
            if ((expired && ["pending", "uploading"].includes(row.status)) || stale) {
              // eslint-disable-next-line no-await-in-loop -- Lock and transition each selected cleanup row in order.
              const [updated] = await tx
                .update(sourceUpload)
                .set({
                  status: expired ? "cancelled" : "pending",
                  claimToken: null,
                  claimExpiresAt: null,
                  storageKey: null,
                  abandonedStorageKeys:
                    row.storageKey === null
                      ? row.abandonedStorageKeys
                      : [...row.abandonedStorageKeys, row.storageKey],
                  updatedAt: at,
                })
                .where(eq(sourceUpload.id, row.id))
                .returning();
              cleanup.push(updated!);
            } else cleanup.push(row);
          }
          return cleanup;
        });
        yield* Effect.forEach(rows, cleanKeys, { concurrency: 4, discard: true });
      }, Effect.mapError(failure)),
    });
  }),
);

/** One bounded batch each minute; database/storage-only, with durable failed-delete retries. */
export const cleanupUploads = Effect.gen(function* () {
  const uploads = yield* SourceUploads;
  yield* uploads.cleanup().pipe(
    Effect.catch((error) => Effect.logError("Upload cleanup failed", error)),
    Effect.repeat(Schedule.spaced("1 minute")),
  );
});
