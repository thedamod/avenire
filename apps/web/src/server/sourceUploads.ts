/** Durable owned upload tickets. Only verified complete source bytes become library rows. */
import {
  CreateSourceUpload,
  DirectSourceUpload,
  FileEventId,
  FileId,
  FolderId,
  IngestionJobId,
  MAX_SOURCE_UPLOAD_BYTES,
  SourceUploadError,
  SourceUploadId,
  StorageKey,
  type LibraryFile,
  type SourceUploadTicket,
  type UserId,
} from "@avenire/contracts";
import {
  Database,
  DatabaseError,
  type DatabaseTransaction,
  type DatabaseClient,
} from "@avenire/database/client";
import { dedupeKeyFor } from "@avenire/capture/url";
import { isDeepStrictEqual } from "node:util";
import { captureCitationUrl, normalizeCaptureOrigin, restoreToCorpusTx } from "./captureOrigin.ts";
import { lockCorpus } from "@avenire/database/corpus";
import {
  file,
  fileEvent,
  fileFolder,
  folder,
  sourceUpload,
  type SourceUploadRow,
  type FileRow,
} from "@avenire/database/schema";
import { enqueueIngestionTx } from "@avenire/ingestion/worker";
import { newId } from "@avenire/shared/id";
import { fileSourceKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { prettyWorkerCause } from "@avenire/shared/error-cause";
import * as Cause from "effect/Cause";
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
/** Preserve the underlying failure in server diagnostics before mapping it to the HTTP boundary. */
const reportFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapError((cause) =>
      cause instanceof SourceUploadError && cause.status < 500
        ? Effect.void
        : Effect.logWarning("Source upload failed", prettyWorkerCause(Cause.fail(cause))),
    ),
    Effect.mapError(failure),
  );

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
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation",
    "application/msword",
    "application/vnd.ms-powerpoint",
    "application/vnd.ms-excel",
    "application/rtf",
    "text/rtf",
  ],
  "web-page": ["text/html", "application/xhtml+xml", "text/markdown"],
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
  if (input.origin) {
    const origin = input.origin;
    if (!Number.isFinite(Date.parse(origin.capturedAt)))
      throw reject(400, "Capture provenance requires a valid timestamp.");
    const urls =
      origin._tag === "Web"
        ? [origin.url, origin.finalUrl, origin.canonicalUrl]
        : // A browser-downloaded file keeps the page it came from for reopening.
          [origin.originUrl];
    for (const value of urls) {
      if (value === undefined) continue;
      const url = URL.parse(value);
      if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw reject(400, "Capture provenance must be an HTTP URL without credentials.");
    }
    if (
      origin._tag === "LocalFile" &&
      (/[\\/]/.test(origin.fileName) ||
        [".", ".."].includes(origin.fileName) ||
        origin.sha256 !== input.sha256.toLowerCase() ||
        origin.sizeBytes !== input.sizeBytes)
    ) {
      throw reject(400, "Local provenance must match the bytes and contain only a file basename.");
    }
  }
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
    access: input.access ?? "open",
    ...(input.origin === undefined ? {} : { origin: normalizeCaptureOrigin(input.origin) }),
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
  row.sourceUrl === (input.sourceUrl ?? null) &&
  row.access === (input.access ?? "open") &&
  isDeepStrictEqual(row.origin, input.origin ?? null);

/**
 * Read a source body once, enforcing the ticket's size and SHA-256 incrementally. `write`
 * receives each chunk (the relay spools to disk); without it the bytes are only hashed.
 */
const consumeSource = async (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  metadata: { sizeBytes: number; sha256: string },
  write?: (chunk: Uint8Array) => Promise<unknown>,
) => {
  const reader = body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  let timedOut = false;
  const abort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, UPLOAD_LEASE_MS);
  try {
    if (signal.aborted) throw reject(400, "The upload was cancelled.");
    while (true) {
      // eslint-disable-next-line no-await-in-loop -- Backpressure and strict streamed size accounting.
      const { value, done } = await reader.read();
      if (timedOut) throw reject(408, "The upload transfer exceeded its time limit.");
      if (signal.aborted) throw reject(400, "The upload was cancelled.");
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_UPLOAD_BYTES)
        throw reject(413, "Source bytes exceed the upload limit.");
      if (size > metadata.sizeBytes)
        throw reject(422, "The upload size does not match its ticket.");
      hash.update(value);
      // eslint-disable-next-line no-await-in-loop -- Keep disk writes bounded to one chunk.
      if (write) await write(value);
    }
    if (size !== metadata.sizeBytes || hash.digest("hex") !== metadata.sha256)
      throw reject(422, "Source size or SHA-256 does not match the upload ticket.");
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};

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
      if (!request.body) throw reject(422, "Source bytes are required.");
      const path = join(directory, "source");
      const handle = await open(path, "wx", 0o600);
      try {
        await consumeSource(request.body, request.signal, metadata, (chunk) =>
          handle.writeFile(chunk),
        );
        return path;
      } finally {
        await handle.close();
      }
    },
    catch: (cause) => cause,
  }).pipe(reportFailure);

/** Hash the provider's stored bytes in one streamed pass; nothing is spooled or buffered. */
export const verifyStoredSource = (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  metadata: { sizeBytes: number; sha256: string },
) =>
  Effect.tryPromise({
    try: () => consumeSource(body, signal, metadata),
    catch: (cause) => cause,
  }).pipe(reportFailure);

export class SourceUploads extends Context.Service<
  SourceUploads,
  {
    readonly create: (
      userId: UserId,
      input: CreateSourceUpload,
    ) => Effect.Effect<SourceUploadTicket, SourceUploadError>;
    readonly prepare: (
      userId: UserId,
      id: SourceUploadId,
      info: { size: number; type: string },
    ) => Effect.Effect<DirectSourceUpload | null, SourceUploadError>;
    readonly put: (
      userId: UserId,
      id: SourceUploadId,
      request: Request,
    ) => Effect.Effect<LibraryFile, SourceUploadError>;
    readonly complete: (
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
    const makeId = <Id extends string>(schema: { readonly make: (id: string) => Id }) =>
      newId(schema).pipe(Effect.provideService(Crypto.Crypto, crypto));
    const wireFile = async (
      db: DatabaseClient | DatabaseTransaction,
      userId: UserId,
      id: string,
    ) => {
      const [row] = await db
        .select()
        .from(file)
        .where(and(eq(file.id, id), eq(file.userId, userId)))
        .limit(1);
      if (!row) throw reject(404, "The uploaded file is unavailable.");
      const links = await db
        .select({ id: fileFolder.folderId })
        .from(fileFolder)
        .innerJoin(folder, and(eq(folder.id, fileFolder.folderId), eq(folder.userId, userId)))
        .where(and(eq(fileFolder.userId, userId), eq(fileFolder.fileId, row.id)));
      return fileToContract(
        row,
        links.map(({ id }) => FolderId.make(id)),
      );
    };
    const readFile = (userId: UserId, id: string) =>
      database.use((db) => wireFile(db, userId, id)).pipe(reportFailure);
    // Caller holds lockCorpus: all capture creates/completions share the same user fence.
    const contentMatch = async (tx: DatabaseTransaction, userId: UserId, sha256: string) => {
      const [match] = await tx
        .select({ file })
        .from(sourceUpload)
        .innerJoin(
          file,
          and(
            eq(file.id, sourceUpload.completedFileId),
            eq(file.userId, userId),
            // A completed ticket for superseded bytes must not match the replacement.
            eq(file.storageKey, sourceUpload.storageKey),
            isNull(file.purgeStartedAt),
          ),
        )
        .where(
          and(
            eq(sourceUpload.userId, userId),
            eq(sourceUpload.sha256, sha256),
            eq(sourceUpload.status, "completed"),
          ),
        )
        .limit(1);
      return match?.file;
    };
    const refreshCapture = async (
      tx: DatabaseTransaction,
      userId: UserId,
      found: FileRow,
      origin: CreateSourceUpload["origin"],
      access: FileRow["access"],
      eventId: string,
      jobId: IngestionJobId,
    ) => {
      const [saved] = await tx
        .update(file)
        .set({
          access,
          ...(origin === undefined
            ? {}
            : { origin, mediaPositionSec: origin.position?.mediaSec ?? found.mediaPositionSec }),
          ...(found.placement === "archived" || found.archivedAt !== null
            ? {
                placement: "inbox" as const,
                archivedAt: null,
                archivedViaFolderId: null,
                purgeRequestedAt: null,
              }
            : {}),
          updatedAt: sql`now()`,
        })
        .where(and(eq(file.id, found.id), eq(file.userId, userId)))
        .returning();
      await tx
        .insert(fileEvent)
        .values({ id: eventId, userId, fileId: found.id, kind: "captured" });
      const restored = found.placement === "archived" || found.archivedAt !== null;
      if (found.access !== access || restored)
        await enqueueIngestionTx(tx, userId, FileId.make(found.id), jobId);
      if (restored) await restoreToCorpusTx(tx, userId, [found.id]);
      return saved!;
    };
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

    const put = Effect.fn("SourceUploads.put")(function* (
      userId: UserId,
      id: SourceUploadId,
      request: Request,
      direct = false,
    ) {
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
        if (direct !== (row.directUpload !== null))
          throw reject(409, "This ticket uses a different upload transport.");
        if (row.status === "cancelled" || row.expiresAt <= at)
          throw reject(410, "This upload ticket has expired or was cancelled.");
        if (row.status === "uploading" && row.claimExpiresAt !== null && row.claimExpiresAt > at)
          throw reject(409, "This upload is already in progress.");
        const key =
          row.directUpload && row.storageKey
            ? row.storageKey
            : fileSourceKey(
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
              row.storageKey === null || row.directUpload
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
      // Verify the provider's bytes, never a browser-reported ETag or digest.
      const verifyDirect = storage
        .stream(key)
        .pipe(Effect.flatMap((body) => verifyStoredSource(body, request.signal, row)));
      const relay = Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () => mkdtemp(join(tmpdir(), "avenire-source-")),
          catch: (cause) => cause,
        }),
        (directory) =>
          Effect.gen(function* () {
            const path = yield* spoolSource(request, directory, row);
            const blob = yield* Effect.tryPromise({
              try: () => openAsBlob(path, { type: row.mimeType }),
              catch: (cause) => cause,
            });
            yield* storage
              .put(key, blob, { contentType: row.mimeType })
              .pipe(Effect.uninterruptible);
          }),
        (directory) =>
          Effect.tryPromise({
            try: () => rm(directory, { recursive: true, force: true }),
            catch: (cause) => cause,
          }).pipe(Effect.ignore({ log: "Error", message: "Source spool cleanup failed" })),
      );
      const upload = Effect.gen(function* () {
        const started = yield* now;
        yield* direct ? verifyDirect : relay;
        const storedAt = yield* now;
        yield* Effect.logInfo("Source transfer verified", {
          uploadId: id,
          sizeBytes: row.sizeBytes,
          transport: direct ? "direct" : "relay",
          durationMs: storedAt.getTime() - started.getTime(),
        });
        const jobId = yield* makeId(IngestionJobId);
        const eventId = yield* makeId(FileEventId);
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
          const match = await contentMatch(tx, userId, row.sha256);
          let saved: FileRow;
          const abandoned = [...current.abandonedStorageKeys];
          if (match) {
            saved = await refreshCapture(
              tx,
              userId,
              match,
              row.origin ?? undefined,
              row.access,
              eventId,
              jobId,
            );
            abandoned.push(key);
          } else {
            const dedupeKey = row.origin === null ? `upload:${id}` : dedupeKeyFor(row.origin);
            const [existing] = await tx
              .select()
              .from(file)
              .where(and(eq(file.userId, userId), eq(file.dedupeKey, dedupeKey)))
              .for("update");
            if (existing?.purgeStartedAt) throw reject(409, "This source is being purged.");
            const values = {
              title: row.title,
              kind: row.kind,
              sourceUrl:
                row.sourceUrl ?? (row.origin === null ? null : captureCitationUrl(row.origin)),
              origin: row.origin,
              access: row.access,
              storageKey: key,
              mimeType: row.mimeType,
              sizeBytes: row.sizeBytes,
              mediaPositionSec: row.origin?.position?.mediaSec ?? null,
            };
            if (existing) {
              const [updated] = await tx
                .update(file)
                .set({
                  ...values,
                  ...(existing.placement === "archived" || existing.archivedAt !== null
                    ? {
                        placement: "inbox" as const,
                        archivedAt: null,
                        archivedViaFolderId: null,
                        purgeRequestedAt: null,
                      }
                    : {}),
                  preview: null,
                  updatedAt: sql`now()`,
                })
                .where(and(eq(file.id, existing.id), eq(file.userId, userId)))
                .returning();
              saved = updated!;
              if (existing.storageKey) abandoned.push(existing.storageKey);
            } else {
              const [inserted] = await tx
                .insert(file)
                .values({
                  ...values,
                  id: row.fileId,
                  userId,
                  source: row.origin === null ? "upload" : "capture",
                  dedupeKey,
                })
                .returning();
              saved = inserted!;
            }
            await tx.insert(fileEvent).values({
              id: eventId,
              userId,
              fileId: saved.id,
              kind: existing || row.origin ? "captured" : "uploaded",
            });
            await enqueueIngestionTx(tx, userId, FileId.make(saved.id), jobId);
            if (existing && (existing.placement === "archived" || existing.archivedAt !== null))
              await restoreToCorpusTx(tx, userId, [existing.id]);
          }
          await tx
            .update(sourceUpload)
            .set({
              status: "completed",
              completedFileId: saved.id,
              storageKey: match ? null : key,
              // The published file owns `key`; a stale tombstone for it must not delete it.
              abandonedStorageKeys: [...new Set(abandoned)].filter(
                (stale) => match || stale !== key,
              ),
              claimToken: null,
              claimExpiresAt: null,
              updatedAt: finishedAt,
            })
            .where(eq(sourceUpload.id, id));
          return wireFile(tx, userId, saved.id);
        });
      });
      return yield* upload.pipe(
        Effect.onError(() =>
          (direct
            ? database.use((db) =>
                db
                  .update(sourceUpload)
                  .set({
                    status: "pending",
                    claimToken: null,
                    claimExpiresAt: null,
                  })
                  .where(and(eq(sourceUpload.id, id), eq(sourceUpload.claimToken, token))),
              )
            : abandonClaim(userId, id, token, key)
          ).pipe(Effect.ignore({ log: "Error", message: "Upload claim release failed" })),
        ),
      );
    }, reportFailure);

    return SourceUploads.of({
      create: Effect.fn("SourceUploads.create")(function* (userId, input) {
        const decoded = yield* Schema.decodeUnknownEffect(CreateSourceUpload)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => reject(400, "Invalid upload metadata.")));
        const metadata = yield* Effect.try({
          try: () => normalizeUploadMetadata(decoded),
          catch: (cause) => cause,
        });
        const id = yield* uuid;
        const fileId = yield* makeId(FileId);
        const at = yield* now;
        const eventId = yield* makeId(FileEventId);
        const jobId = yield* makeId(IngestionJobId);
        const result = yield* database.useTransaction(async (tx) => {
          await lockCorpus(tx, userId);
          const [existing] = await tx
            .select()
            .from(sourceUpload)
            .where(
              and(
                eq(sourceUpload.userId, userId),
                eq(sourceUpload.idempotencyKey, metadata.idempotencyKey),
              ),
            )
            .limit(1);
          if (existing && !sameMetadata(existing, metadata))
            throw reject(409, "This idempotency key belongs to different upload metadata.");
          if (
            existing &&
            existing.status !== "completed" &&
            (existing.status === "cancelled" || existing.expiresAt <= at)
          )
            throw reject(410, "This upload ticket is no longer available.");
          if (existing?.status === "completed")
            return {
              ...ticket(existing),
              file: await wireFile(tx, userId, existing.completedFileId ?? existing.fileId),
            };
          const match = await contentMatch(tx, userId, metadata.sha256);
          // An active PUT owns its ticket until completion, which performs this same check.
          if (existing?.status === "uploading") return ticket(existing);
          const [row] = existing
            ? [existing]
            : await tx
                .insert(sourceUpload)
                .values({
                  ...metadata,
                  sourceUrl: metadata.sourceUrl ?? null,
                  origin: metadata.origin ?? null,
                  id,
                  userId,
                  fileId,
                  status: "pending",
                  expiresAt: new Date(at.getTime() + UPLOAD_TTL_MS),
                })
                .returning();
          if (!match) return ticket(row!);
          const saved = await refreshCapture(
            tx,
            userId,
            match,
            metadata.origin,
            metadata.access ?? "open",
            eventId,
            jobId,
          );
          const [completed] = await tx
            .update(sourceUpload)
            .set({
              status: "completed",
              completedFileId: saved.id,
              // A prepared direct target may already hold bytes; the matched file owns the source.
              storageKey: null,
              directUpload: null,
              abandonedStorageKeys:
                row!.storageKey === null
                  ? row!.abandonedStorageKeys
                  : [...new Set([...row!.abandonedStorageKeys, row!.storageKey])],
              updatedAt: at,
            })
            .where(eq(sourceUpload.id, row!.id))
            .returning();
          return { ...ticket(completed!), file: await wireFile(tx, userId, saved.id) };
        });
        return result;
      }, reportFailure),
      prepare: Effect.fn("SourceUploads.prepare")(function* (userId, id, info) {
        const at = yield* now;
        const row = yield* database.use((db) =>
          db.query.sourceUpload.findFirst({
            where: and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)),
          }),
        );
        if (!row) return yield* reject(404, "Upload ticket not found.");
        if (row.status === "cancelled" || row.expiresAt <= at)
          return yield* reject(410, "This upload ticket has expired or was cancelled.");
        if (row.status !== "pending")
          return yield* reject(409, "This upload is already in progress or completed.");
        if (info.size !== row.sizeBytes || info.type !== row.mimeType)
          return yield* reject(422, "Source size and type must match the upload ticket.");
        if (row.directUpload) {
          return yield* Schema.decodeUnknownEffect(DirectSourceUpload)(row.directUpload).pipe(
            Effect.mapError(() =>
              reject(410, "This upload ticket uses an older transport. Capture again."),
            ),
          );
        }
        if (!storage.prepareSourceUpload) return null;
        // Fresh per presign: after a stale claim is reset, the old key stays tombstoned for deletion.
        const suffix = yield* uuid;
        const key = fileSourceKey(
          userId,
          FileId.make(row.fileId),
          "source",
          suffix.replaceAll("-", "").slice(-12),
        );
        const direct = yield* storage.prepareSourceUpload(key, {
          contentType: row.mimeType,
          sizeBytes: row.sizeBytes,
          expiresInSeconds: Math.max(
            1,
            Math.floor((row.expiresAt.getTime() - at.getTime()) / 1000),
          ),
        });
        if (!direct) return null;
        return yield* database.useTransaction(async (tx) => {
          await tx
            .update(sourceUpload)
            .set({ storageKey: key, directUpload: direct })
            .where(
              and(
                eq(sourceUpload.id, id),
                eq(sourceUpload.userId, userId),
                eq(sourceUpload.status, "pending"),
                isNull(sourceUpload.storageKey),
              ),
            );
          const [current] = await tx
            .select()
            .from(sourceUpload)
            .where(and(eq(sourceUpload.id, id), eq(sourceUpload.userId, userId)));
          if (!current || current.status !== "pending" || current.expiresAt <= at)
            throw reject(409, "This upload is no longer available for transfer.");
          return current.directUpload;
        });
      }, reportFailure),
      put: (userId, id, request) => put(userId, id, request),
      complete: (userId, id, request) => put(userId, id, request, true),
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
      }, reportFailure),
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
                  directUpload: null,
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
      }, reportFailure),
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
