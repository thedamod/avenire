import type { PageSnapshot, SourceAccess } from "@avenire/contracts";
import { encodeFileFrame, FILE_FRAME_BYTES } from "@avenire/capture/frames";
import { classifyAccess } from "@avenire/capture/access";
import { DOCUMENT_MIMES, documentExtension, type DocumentHint } from "./documents.ts";

export const MAX_CAPTURE_BYTES = 256 * 1024 * 1024;
export interface FileBudget {
  count: number;
  bytes: number;
  readonly urls: Set<string>;
}
export interface CapturedFile {
  readonly page: PageSnapshot;
  readonly bytes: Uint8Array<ArrayBuffer>;
}
export class DocumentAccessError extends Error {
  readonly access: SourceAccess;
  constructor(access: SourceAccess) {
    super(access);
    this.access = access;
  }
}
export const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export function* fileFrames(requestId: string, file: CapturedFile): Generator<Uint8Array> {
  const metadata = file.page.file;
  if (!metadata) return;
  for (let offset = 0, seq = 0; offset < file.bytes.byteLength; offset += FILE_FRAME_BYTES, seq++)
    yield encodeFileFrame(
      {
        requestId,
        tabId: file.page.tabId,
        sha256: metadata.sha256,
        seq,
        final: offset + FILE_FRAME_BYTES >= file.bytes.byteLength,
      },
      file.bytes.subarray(offset, offset + FILE_FRAME_BYTES),
    );
}

export function safeFileName(raw: string): string {
  return raw
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 255);
}

export async function fetchDocument(
  hint: DocumentHint,
  page: PageSnapshot,
  budget: FileBudget,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  permitted: (url: string) => boolean = () => true,
): Promise<CapturedFile | undefined> {
  const key = hint.url.split("#")[0]!;
  if (signal.aborted || budget.count >= 10 || budget.urls.has(key)) return undefined;
  budget.urls.add(key);
  budget.count++;
  // Count failed attempts too: a page cannot turn capture into an unbounded download crawler.
  const response = await fetcher(hint.url, { credentials: "include", signal });
  if (response.url && !permitted(response.url)) {
    await response.body?.cancel();
    throw new Error("Document redirect blocked by capture policy");
  }
  if (!response.ok) {
    await response.body?.cancel();
    const access = classifyAccess({
      visibleTextLength: 0,
      passwordInput: false,
      paywallContainers: [],
      httpStatus: response.status,
    });
    if (access !== "open") throw new DocumentAccessError(access);
    throw new Error(`Document request failed (${response.status})`);
  }
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_CAPTURE_BYTES - budget.bytes) {
    await response.body?.cancel();
    throw new Error("Capture file limit exceeded");
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (/html|xhtml/.test(mime)) {
    await response.body?.cancel();
    throw new Error("Document returned a login or HTML page");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Document response has no body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      budget.bytes += part.value.byteLength;
      size += part.value.byteLength;
      if (signal.aborted || budget.bytes > MAX_CAPTURE_BYTES)
        throw new Error("Capture file limit exceeded");
      chunks.push(part.value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("Document is empty");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 512));
  if (/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(head))
    throw new Error("Document returned a login or HTML page");
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let dispositionName = /filename="?([^";]+)/i.exec(disposition)?.[1] ?? "";
  try {
    if (encodedName) dispositionName = decodeURIComponent(encodedName);
  } catch {
    /* Use plain filename. */
  }
  const url = new URL(response.url || hint.url);
  let segment = url.pathname.split("/").pop() ?? "";
  try {
    segment = decodeURIComponent(segment);
  } catch {
    /* Keep the URL segment. */
  }
  const format = url.searchParams.get("format");
  const extension =
    documentExtension(url.href) ||
    (format && DOCUMENT_MIMES[format] ? format : "") ||
    Object.keys(DOCUMENT_MIMES).find((ext) => DOCUMENT_MIMES[ext] === mime) ||
    "";
  let fileName = safeFileName(
    dispositionName ||
      hint.name ||
      (extension && segment.includes(".") ? segment : page.title) ||
      "document",
  );
  if (extension && !new RegExp(`\\.${extension}$`, "i").test(fileName))
    fileName = `${fileName.slice(0, 240)}.${extension}`;
  const mimeType =
    !mime || mime === "application/octet-stream" ? (DOCUMENT_MIMES[extension] ?? mime) : mime;
  if (
    !mimeType ||
    (!Object.values(DOCUMENT_MIMES).includes(mimeType) && !DOCUMENT_MIMES[extension])
  )
    throw new Error("Unsupported document type");
  return {
    bytes,
    page: {
      ...page,
      url: hint.url,
      canonicalUrl: hint.url,
      title: fileName,
      text: "",
      textLength: 0,
      file: {
        url: hint.url,
        ...(hint.originUrl ? { originUrl: hint.originUrl } : {}),
        fileName,
        mimeType,
        sizeBytes: size,
        sha256: await sha256(bytes),
      },
    },
  };
}

/** Extraction and socket backpressure share the caller's local deadline. */
export async function sendFileFrames(
  requestId: string,
  files: readonly CapturedFile[],
  socket: Pick<WebSocket, "readyState" | "bufferedAmount" | "send">,
  deadline: number,
  connected: () => boolean,
): Promise<void> {
  for (const file of files)
    for (const frame of fileFrames(requestId, file)) {
      while (
        Date.now() < deadline &&
        socket.bufferedAmount > 2 * 1024 * 1024 &&
        socket.readyState === 1
      )
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(10, deadline - Date.now())),
        );
      if (Date.now() >= deadline || !connected() || socket.readyState !== 1) return;
      socket.send(new Uint8Array(frame));
    }
}
