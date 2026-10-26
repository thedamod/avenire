/** Device-only byte transfer. Parsing, OCR, transcription and indexing belong to the server. */
import type { Stats } from "node:fs";
import { createHash } from "node:crypto";
import { open, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import * as Schema from "effect/Schema";
import {
  CreateSourceUpload,
  LibraryFile,
  MAX_SOURCE_UPLOAD_BYTES,
  SourceUploadTicket,
  type CaptureOrigin,
} from "@avenire/contracts";

import type { HashLru } from "./hash-cache.ts";
import type { LocalOrigin } from "./registry.ts";

export class DeviceAcquisitionError extends Schema.TaggedError<DeviceAcquisitionError>()(
  "DeviceAcquisitionError",
  { operation: Schema.Literals(["acquire", "upload"]), cause: Schema.Defect() },
) {
  override get message(): string {
    return this.cause instanceof Error
      ? this.cause.message
      : `Device source ${this.operation} failed`;
  }
}

export type DeviceSource =
  | { readonly type: "local-file"; readonly path: string }
  | { readonly type: "session-url"; readonly url: string }
  | { readonly type: "browser-blob"; readonly blob: Blob };

/** Source cookies and redirect credential policy live in the browser/session adapter. */
export type DeviceSessionFetch = (
  url: string,
  init: {
    readonly method: "GET";
    readonly credentials: "include";
    readonly redirect: "follow";
    readonly signal: AbortSignal;
  },
) => Promise<Response>;
export type AvenireUploadFetch = (url: string, init: RequestInit) => Promise<Response>;
export type SourceUploadMetadata = Pick<
  CreateSourceUpload,
  "idempotencyKey" | "title" | "kind" | "mimeType" | "sourceUrl" | "origin" | "access"
>;
export interface DeviceAcquisitionOptions {
  /** Trusted application configuration, never a source URL or page-controlled value. */
  readonly appUrl: string;
  readonly avenireFetch: AvenireUploadFetch;
  readonly sourceSessionFetch?: DeviceSessionFetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** A caller may lower, never raise, the contract's 256 MiB limit. */
  readonly maxBytes?: number;
  readonly tempRoot?: string;
  readonly hashCache?: HashLru;
  readonly localOrigin?: Omit<
    Extract<CaptureOrigin, { _tag: "LocalFile" }>,
    "sha256" | "sizeBytes"
  >;
  readonly onLocalUploaded?: (file: LibraryFile, origin: LocalOrigin) => Promise<void>;
}

const httpUrl = (value: string) => {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("A credential-free HTTP(S) URL is required");
  return url;
};
const provenance = (value: string) => {
  const url = httpUrl(value);
  url.search = "";
  url.hash = "";
  return url.href;
};
const asNodeStream = (stream: ReadableStream<Uint8Array>) =>
  Readable.fromWeb(stream as unknown as NodeReadableStream<Uint8Array>);
const checkSourceMime = (actual: string | null, expected: string) => {
  const mime = actual?.split(";")[0]?.trim().toLowerCase();
  if (!mime || ["application/octet-stream", "binary/octet-stream"].includes(mime)) return;
  if (
    (expected !== "text/html" &&
      expected !== "application/xhtml+xml" &&
      ["text/html", "application/xhtml+xml"].includes(mime)) ||
    (expected === "application/pdf" && mime !== "application/pdf")
  )
    throw new Error(
      `Device source MIME mismatch: expected ${expected}, received ${mime}; authenticate or choose the original file`,
    );
};

/** Include uncooperative injected adapters in the operation deadline. */
const abortable = async <A>(promise: Promise<A>, signal: AbortSignal): Promise<A> => {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};

const readJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  if (!response.body) throw new Error("Empty upload response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error("Upload response exceeds byte limit");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

/**
 * Spool/hash original bytes on the user's device, then upload them using only Avenire's
 * session. The temporary copy is removed on every exit. No source-session headers or
 * device paths are accepted as upload metadata. The caller supplies an explicit title.
 */
export const acquireAndUploadSource = async (
  source: DeviceSource,
  metadata: SourceUploadMetadata,
  options: DeviceAcquisitionOptions,
): Promise<LibraryFile> => {
  let operation: "acquire" | "upload" = "acquire";
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10 * 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new DeviceAcquisitionError({ operation, cause: "Invalid deadline" });
  const timer = setTimeout(
    () => controller.abort(new Error("Device source deadline exceeded")),
    timeoutMs,
  );
  timer.unref();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  let directory: string | undefined;
  let sourceStream: Readable | undefined;
  let uploadStream: Readable | undefined;
  let cancelUrl: string | undefined;
  let completed = false;
  let localFile: Awaited<ReturnType<typeof open>> | undefined;
  let localInfo: Stats | undefined;
  let cachedHash: string | undefined;
  try {
    signal.throwIfAborted();
    const app = httpUrl(options.appUrl);
    const maxBytes = Math.min(options.maxBytes ?? MAX_SOURCE_UPLOAD_BYTES, MAX_SOURCE_UPLOAD_BYTES);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
      throw new Error("Invalid source byte limit");
    const sourceUrl =
      metadata.sourceUrl === undefined
        ? source.type === "session-url"
          ? provenance(source.url)
          : undefined
        : provenance(metadata.sourceUrl);
    const cleanMetadata = {
      idempotencyKey: metadata.idempotencyKey,
      title: metadata.title,
      kind: metadata.kind,
      mimeType: metadata.mimeType.split(";")[0]!.trim().toLowerCase(),
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
      ...(metadata.origin === undefined ? {} : { origin: metadata.origin }),
      ...(metadata.access === undefined ? {} : { access: metadata.access }),
    };
    // Reject malformed metadata before touching a local file or an authenticated session.
    Schema.decodeUnknownSync(CreateSourceUpload)({
      ...cleanMetadata,
      sizeBytes: 1,
      sha256: "0".repeat(64),
    });
    if (source.type === "local-file") {
      const file = await open(source.path, "r");
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > maxBytes)
          throw new Error("Local source exceeds byte limit or is not a regular file");
        localFile = file;
        localInfo = info;
        cachedHash = options.hashCache?.get(source.path, info.size, info.mtimeMs);
        sourceStream = file.createReadStream({ autoClose: false });
      } catch (cause) {
        await file.close();
        throw cause;
      }
    } else if (source.type === "browser-blob") {
      if (source.blob.size > maxBytes) throw new Error("Browser source exceeds byte limit");
      checkSourceMime(source.blob.type, cleanMetadata.mimeType);
      sourceStream = asNodeStream(source.blob.stream());
    } else {
      if (!options.sourceSessionFetch)
        throw new Error("An authorized device session fetch is required");
      const url = httpUrl(source.url);
      const pending = options.sourceSessionFetch(url.href, {
        method: "GET",
        credentials: "include",
        redirect: "follow",
        signal,
      });
      // If an adapter ignores cancellation, dispose of any body it eventually returns.
      void pending.then(
        (response) => {
          if (signal.aborted) void response.body?.cancel().catch(() => {});
        },
        () => {},
      );
      const response = await abortable(pending, signal);
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw new Error(`Device source returned HTTP ${response.status}`);
      }
      try {
        checkSourceMime(response.headers.get("content-type"), cleanMetadata.mimeType);
      } catch (cause) {
        void response.body.cancel().catch(() => {});
        throw cause;
      }
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
        void response.body.cancel().catch(() => {});
        throw new Error("Device source exceeds declared byte limit");
      }
      sourceStream = asNodeStream(response.body);
    }
    signal.throwIfAborted();
    directory = await mkdtemp(join(options.tempRoot ?? tmpdir(), "avenire-device-source-"));
    const path = join(directory, "source");
    const destination = await open(path, "wx", 0o600);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        if (sizeBytes > maxBytes) {
          callback(new Error("Device source stream exceeds byte limit"));
          return;
        }
        if (!cachedHash) hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(sourceStream, meter, destination.createWriteStream(), { signal });
    if (sizeBytes === 0) throw new Error("Empty source bytes cannot be uploaded");
    const sha256 = cachedHash ?? hash.digest("hex");
    if (source.type === "local-file" && localFile && localInfo) {
      const after = await localFile.stat();
      if (
        after.size !== localInfo.size ||
        after.mtimeMs !== localInfo.mtimeMs ||
        after.ctimeMs !== localInfo.ctimeMs ||
        sizeBytes !== localInfo.size
      )
        throw new Error("Source changed during capture; capture again.");
      options.hashCache?.set(source.path, sizeBytes, localInfo.mtimeMs, sha256);
    }
    const payload = Schema.decodeUnknownSync(CreateSourceUpload)({
      ...cleanMetadata,
      ...(source.type === "local-file" && options.localOrigin
        ? { origin: { ...options.localOrigin, sha256, sizeBytes } }
        : {}),
      sizeBytes,
      sha256,
    });
    const finish = async (file: LibraryFile) => {
      if (source.type === "local-file" && localInfo && options.onLocalUploaded)
        await options.onLocalUploaded(file, {
          path: source.path,
          sha256,
          sizeBytes,
          mtimeMs: localInfo.mtimeMs,
          ...(options.localOrigin?.appName ? { appName: options.localOrigin.appName } : {}),
        });
      return file;
    };
    operation = "upload";
    const request = (url: string, init: RequestInit, requestSignal = signal) =>
      abortable(
        options.avenireFetch(url, {
          ...init,
          redirect: "error",
          credentials: "include",
          signal: requestSignal,
        }),
        requestSignal,
      );
    const created = await request(new URL("/api/library/uploads", app).href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!created.ok) {
      void created.body?.cancel().catch(() => {});
      throw new Error(`Upload creation returned HTTP ${created.status}`);
    }
    const ticket = Schema.decodeUnknownSync(SourceUploadTicket)(await readJson(created, signal));
    const target = httpUrl(new URL(ticket.uploadUrl, app).href);
    if (
      target.origin !== app.origin ||
      target.pathname !== `/api/library/uploads/${ticket.uploadId}` ||
      target.search ||
      target.hash
    )
      throw new Error("Upload ticket destination is outside the approved application endpoint");
    cancelUrl = target.href;
    completed = ticket.status === "completed";
    if (
      ticket.status === "cancelled" ||
      !Number.isFinite(Date.parse(ticket.expiresAt)) ||
      (!completed && Date.parse(ticket.expiresAt) <= Date.now())
    )
      throw new Error("Upload ticket is cancelled or expired");
    if (completed && ticket.file) return await finish(ticket.file);
    // Older servers may omit file on completed tickets; retain the idempotent PUT fallback.
    const file = await open(path, "r");
    uploadStream = file.createReadStream();
    const uploaded = await request(target.href, {
      method: "PUT",
      headers: { "content-type": payload.mimeType, "content-length": String(sizeBytes) },
      body: Readable.toWeb(uploadStream) as ReadableStream<Uint8Array>,
      duplex: "half",
    } as RequestInit);
    if (!uploaded.ok) {
      void uploaded.body?.cancel().catch(() => {});
      throw new Error(`Source upload returned HTTP ${uploaded.status}`);
    }
    // A successful PUT has finalized the server upload even if response decoding fails.
    completed = true;
    const result = Schema.decodeUnknownSync(LibraryFile)(await readJson(uploaded, signal));
    return await finish(result);
  } catch (cause) {
    throw new DeviceAcquisitionError({ operation, cause });
  } finally {
    clearTimeout(timer);
    controller.abort();
    sourceStream?.destroy();
    uploadStream?.destroy();
    await localFile?.close().catch(() => {});
    if (cancelUrl !== undefined && !completed) {
      // Cancellation gets a fresh short deadline even when the main request was aborted.
      const cleanupSignal = AbortSignal.timeout(2000);
      try {
        const response = await abortable(
          options.avenireFetch(cancelUrl, {
            method: "DELETE",
            redirect: "error",
            credentials: "include",
            signal: cleanupSignal,
          }),
          cleanupSignal,
        );
        void response.body?.cancel().catch(() => {});
      } catch {
        /* Best effort: unfinished uploads also expire on the server. */
      }
    }
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  }
};
