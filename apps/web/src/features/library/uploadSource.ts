"use client";

import {
  LibraryFile,
  MAX_SOURCE_UPLOAD_BYTES,
  SourceUploadTicket,
  type FileKind,
} from "@avenire/contracts";
import { hashBlob } from "@avenire/shared/sha256";
import { SourceWorkQueue } from "@avenire/capture/work-queue";
import { transferDirectSource, requestSourceTicket } from "@avenire/capture/source-transfer";
import * as Schema from "effect/Schema";

// Browser MIME detection is often empty (notably Markdown) or generic. Use the extension
// only for those cases; a specific unsupported MIME must still fail validation.
const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
};

export const SOURCE_UPLOAD_ACCEPT = Object.keys(EXTENSION_MIME)
  .map((extension) => `.${extension}`)
  .join(",");

export function mimeForFile(file: File): string {
  const type = file.type.split(";", 1)[0]!.trim().toLowerCase();
  return !type || type === "application/octet-stream"
    ? (EXTENSION_MIME[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? type)
    : type;
}

/** The upload kinds the server accepts, by MIME type. */
export function kindForFile(file: File): FileKind | null {
  const type = mimeForFile(file);
  if (type === "application/pdf") return "pdf";
  if (
    [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "image/tiff",
      "image/bmp",
      "image/heic",
      "image/heif",
    ].includes(type)
  )
    return "image";
  if (
    ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/ogg"].includes(type)
  )
    return "video";
  if (
    [
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/x-wav",
      "audio/ogg",
      "audio/webm",
      "audio/flac",
      "audio/aac",
    ].includes(type)
  )
    return "audio";
  if (type === "text/html" || type === "application/xhtml+xml") return "web-page";
  if (
    [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
      "application/msword",
      "application/vnd.ms-powerpoint",
      "application/vnd.ms-excel",
      "application/rtf",
      "text/rtf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].includes(type)
  )
    return "document";
  return null;
}

const preparation = new SourceWorkQueue(1);
async function sha256(file: File): Promise<string> {
  return preparation.run(file.size, async () => {
    if (typeof Worker === "undefined") return hashBlob(file);
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url));
    try {
      return await new Promise<string>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<{ hash?: string; error?: string }>) =>
          event.data.hash ? resolve(event.data.hash) : reject(new Error(event.data.error));
        worker.onerror = () => reject(new Error("Could not prepare this file."));
        worker.postMessage(file);
      });
    } finally {
      worker.terminate();
    }
  });
}

/**
 * Upload through the durable source endpoint. Completion publishes the library file and
 * ingestion job atomically. Reuse the idempotency key when retrying an uncertain response.
 */
export async function uploadSource(
  file: File,
  options: {
    idempotencyKey?: string;
    onStage?: (stage: "preparing" | "uploading" | "saving") => void;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<LibraryFile> {
  const kind = kindForFile(file);
  if (!kind) throw new Error(`${file.name}: this file type isn't supported.`);
  if (file.size === 0 || file.size > MAX_SOURCE_UPLOAD_BYTES)
    throw new Error(`${file.name} is empty or larger than 256 MB.`);
  options.onStage?.("preparing");
  const mimeType = mimeForFile(file);
  const payload = {
    transport: "direct",
    idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    title: file.name.slice(0, 200),
    kind,
    mimeType,
    sizeBytes: file.size,
    sha256: await sha256(file),
  };
  const created = await requestSourceTicket(
    (body) =>
      fetch("/api/library/uploads", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body,
      }),
    payload,
  );
  if (!created.ok) throw new Error(`Couldn't upload ${file.name} (${created.status}).`);
  const ticket = Schema.decodeUnknownSync(SourceUploadTicket)(await created.json());
  if (ticket.status === "completed" && ticket.file) {
    options.onProgress?.(100);
    return ticket.file;
  }
  const target = new URL(ticket.uploadUrl, window.location.origin);
  if (target.origin !== window.location.origin) throw new Error("Unexpected upload destination.");
  options.onStage?.("uploading");
  if (ticket.direct) {
    await transferDirectSource(ticket.direct.url, file, {
      onProgress: (loaded, total) => options.onProgress?.(Math.floor((loaded / total) * 100)),
      ...(typeof XMLHttpRequest === "undefined"
        ? {}
        : {
            send: (url: string, body: FormData, offset: number, signal: AbortSignal) =>
              directRequest(url, body, offset, file.size, signal, options.onProgress),
          }),
    });
    options.onStage?.("saving");
    const completed = await fetch(target, {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(15 * 60_000),
    });
    if (!completed.ok) throw new Error(`Couldn't verify ${file.name} (${completed.status}).`);
    return Schema.decodeUnknownSync(LibraryFile)(await completed.json());
  }
  const uploaded = await transferSource(target, file, mimeType, options);
  if (!uploaded.ok) throw new Error(`Couldn't upload ${file.name} (${uploaded.status}).`);
  return Schema.decodeUnknownSync(LibraryFile)(await uploaded.json());
}

/** Like files-sdk/client's transport, use XHR for actual upload-byte progress. Keep the
 * owned, hash-verified ticket endpoint rather than exposing a generic storage gateway. */
async function transferSource(
  target: URL,
  file: File,
  mimeType: string,
  options: {
    onStage?: (stage: "preparing" | "uploading" | "saving") => void;
    onProgress?: (percent: number) => void;
  },
): Promise<Pick<Response, "ok" | "status" | "json">> {
  options.onProgress?.(0);
  if (typeof XMLHttpRequest === "undefined") {
    const response = await fetch(target, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": mimeType },
      body: file,
    });
    if (response.ok) options.onProgress?.(100);
    return response;
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", target.href, true);
    request.withCredentials = true;
    request.setRequestHeader("content-type", mimeType);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(100, Math.floor((event.loaded / event.total) * 100)));
      }
    });
    // All bytes reaching the server is distinct from its verified storage/DB commit.
    request.upload.addEventListener("load", () => {
      options.onProgress?.(100);
      options.onStage?.("saving");
    });
    request.addEventListener("load", () => {
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        json: async () => JSON.parse(request.responseText),
      });
    });
    request.addEventListener("error", () =>
      reject(new Error("Connection lost. Try the upload again.")),
    );
    request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    request.addEventListener("timeout", () =>
      reject(new Error("The upload timed out. Try again.")),
    );
    request.timeout = 15 * 60 * 1000;
    request.send(file);
  });
}

function directRequest(
  url: string,
  body: FormData,
  offset: number,
  total: number,
  signal: AbortSignal,
  progress?: (percent: number) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal.removeEventListener("abort", abort);
    request.open("PUT", url);
    request.setRequestHeader("Range", `bytes=${offset}-`);
    request.upload.onprogress = (event) =>
      progress?.(Math.min(99, Math.floor(((offset + event.loaded) / total) * 100)));
    request.onload = () => {
      cleanup();
      resolve(new Response(request.responseText, { status: request.status }));
    };
    request.onerror = () => {
      cleanup();
      reject(new TypeError("Connection lost."));
    };
    request.onabort = () => {
      cleanup();
      reject(signal.reason ?? new Error("Upload cancelled."));
    };
    request.ontimeout = () => {
      cleanup();
      reject(new TypeError("Upload timed out."));
    };
    request.timeout = 15 * 60_000;
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      cleanup();
      reject(signal.reason);
      return;
    }
    request.send(body);
  });
}
