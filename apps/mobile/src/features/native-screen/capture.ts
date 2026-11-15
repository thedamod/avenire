/* eslint-disable no-await-in-loop -- One durable capture is settled before claiming another. */
import {
  CreateSourceUpload,
  MobileCaptureWork,
  SourceUploadTicket,
  SourceUploadStatus,
  FileId,
} from "@avenire/contracts";
import { normalizeUrl } from "@avenire/capture/url";
import { uploadSourceTicket } from "@avenire/storage/client";
import { call, makeClientRuntime, disposeClientRuntime } from "@avenire/client-runtime/rpc";
import * as Schema from "effect/Schema";
import { nativeScreenBridge } from "./native";
import { apiUrl, authClient, getCookieHeader } from "../../state/auth";

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Avenire is unavailable. Retrying capture…")),
          20000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
let running: Promise<void> | undefined;
export function runCaptureTask(): Promise<void> {
  if (!running)
    running = drain().finally(() => {
      running = undefined;
    });
  return running;
}
async function drain() {
  const bridge = nativeScreenBridge();
  if (!bridge || typeof bridge.captureWork !== "function") return;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 215_000);
  const runtime = makeClientRuntime({
    baseUrl: apiUrl,
    getAuthHeaders: getCookieHeader,
    credentials: "omit",
  });
  try {
    const session = await bounded(authClient.getSession());
    if (session.error) {
      await bridge.captureDefer();
      return;
    }
    if (!session.data?.user) {
      await bridge.bindOwner("");
      return;
    }
    const owner = session.data.user.id;
    await bridge.bindOwner(owner);
    for (let count = 0; count < 32 && !abort.signal.aborted; count++) {
      const raw = await bridge.captureWork(owner);
      if (!raw) break;
      let work = Schema.decodeUnknownSync(MobileCaptureWork)(JSON.parse(raw));
      if (work.owner !== owner) throw new Error("Capture account mismatch.");
      const update = (changes: Record<string, unknown>) =>
        bridge.captureUpdate(work.id, owner, JSON.stringify(changes));
      const current = async () =>
        Schema.decodeUnknownSync(MobileCaptureWork)(
          JSON.parse(await bridge.captureRead(work.id, owner)),
        );
      const authenticated = async (url: string, init: RequestInit = {}) => {
        if (abort.signal.aborted) throw new Error("Capture request timed out.");
        const auth = await bounded(authClient.getSession());
        if (auth.data?.user.id !== owner)
          throw new Error("Sign in to the account that captured this source.");
        const headers = new Headers(init.headers);
        for (const [key, value] of Object.entries(await getCookieHeader())) headers.set(key, value);
        return fetch(url, {
          ...init,
          headers,
          credentials: "omit",
          redirect: "error",
          signal: abort.signal,
        });
      };
      const json = async <S extends Schema.Top & { readonly DecodingServices: never }>(
        url: string,
        schema: S,
        init?: RequestInit,
      ): Promise<S["Type"]> => {
        const response = await authenticated(url, init);
        if (!response.ok)
          throw Object.assign(
            new Error(
              response.status === 410
                ? "Capture ticket expired. Capture this source again."
                : `Capture request failed (${response.status}).`,
            ),
            { status: response.status },
          );
        return Schema.decodeUnknownSync(schema)(await response.json());
      };
      let stopped = false;
      const poll = setInterval(() => {
        void current()
          .then((row) => {
            if (row.undo) return bridge.captureCancelTransfer(work.id);
          })
          .catch(() => {
            stopped = true;
          });
      }, 750);
      try {
        const acquireUrl =
          work.acquisitionUrl ?? (work.origin._tag === "Screen" ? work.origin.url : undefined);
        if (acquireUrl && !work.undo && !work.attempted) {
          await update({ phase: "acquiring" });
          work = Schema.decodeUnknownSync(MobileCaptureWork)(
            JSON.parse(await bridge.captureAcquire(work.id, owner, normalizeUrl(acquireUrl))),
          );
        }
        const origin =
          work.origin._tag === "Screen" && work.origin.url
            ? { ...work.origin, url: normalizeUrl(work.origin.url) }
            : work.origin;
        const metadata = Schema.decodeUnknownSync(CreateSourceUpload)({
          idempotencyKey: work.id,
          title: work.title.slice(0, 200),
          kind: work.kind,
          mimeType: work.mimeType,
          sizeBytes: work.sizeBytes,
          sha256: work.sha256,
          origin,
          ...(origin._tag === "Web" ? { sourceUrl: origin.finalUrl ?? origin.url } : {}),
        });
        await update({ attempted: true });
        let row = await current();
        let ticket: typeof SourceUploadTicket.Type;
        if (work.ticket) {
          const status = await json(
            `${apiUrl}/api/library/uploads/${work.ticket}`,
            SourceUploadStatus,
          );
          ticket = status.ticket;
        } else {
          ticket = await json(`${apiUrl}/api/library/uploads`, SourceUploadTicket, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(metadata),
          });
          await update({ ticket: ticket.uploadId });
        }
        row = await current();
        if (row.undo) {
          const response = await authenticated(`${apiUrl}/api/library/uploads/${ticket.uploadId}`, {
            method: "DELETE",
          });
          if (!response.ok && response.status !== 404 && response.status !== 410)
            throw new Error("Could not undo capture. Retrying…");
          await update({ phase: "undone", leaseUntil: 0 });
          continue;
        }
        if (ticket.status === "cancelled") {
          await update({ phase: "undone", leaseUntil: 0 });
          continue;
        }
        let file = ticket.file;
        if (!file) {
          await update({ phase: "uploading" });
          const endpoint = new URL(ticket.uploadUrl, apiUrl);
          if (
            endpoint.origin !== new URL(apiUrl).origin ||
            endpoint.pathname !== `/api/library/uploads/${ticket.uploadId}`
          )
            throw new Error("Invalid capture upload destination.");
          file = await uploadSourceTicket(
            endpoint,
            {
              uri: work.uri ?? "",
              name: work.origin._tag === "LocalFile" ? work.origin.fileName : work.id,
              type: work.mimeType,
              size: work.sizeBytes,
            },
            {
              contentType: work.mimeType,
              appFetch: authenticated,
              signal: abort.signal,
              // Native refs remain on device; PUT fallback reads a native Blob, never base64 in JS.
              sourceFetch: fetch,
              transport: async (request) => {
                const latest = await current();
                if (latest.undo || stopped) throw new Error("Capture cancelled.");
                const url = new URL(request.url, apiUrl);
                const headers = {
                  ...request.headers,
                  ...(url.origin === new URL(apiUrl).origin ? await getCookieHeader() : {}),
                };
                const result = await bridge.captureSend(
                  work.id,
                  owner,
                  url.href,
                  request.method,
                  JSON.stringify(headers),
                  JSON.stringify(request.fields ?? {}),
                  new URL(apiUrl).origin,
                );
                return JSON.parse(result) as { status: number; text: string };
              },
            },
          );
        }
        await update({ fileId: file.id, phase: "extracting" });
        row = await current();
        if (row.undo) {
          await update({ leaseUntil: 0, nextAt: 0 });
          continue;
        }
        if (row.retry && row.fileId) {
          const beforeRetry = await json(
            `${apiUrl}/api/library/uploads/${ticket.uploadId}`,
            SourceUploadStatus,
          );
          if (
            !beforeRetry.ingestion ||
            ["failed", "paused", "cancelled"].includes(beforeRetry.ingestion.status)
          )
            await bounded(
              call(runtime, (client) =>
                client["library.setIngestionPaused"]({
                  fileId: FileId.make(row.fileId!),
                  paused: false,
                }),
              ),
            );
          await update({ retry: false });
        }
        const status = await json(
          `${apiUrl}/api/library/uploads/${ticket.uploadId}`,
          SourceUploadStatus,
        );
        const job = status.ingestion;
        await update({
          phase:
            job?.status === "indexed"
              ? job.coverage?.status === "full"
                ? "ready"
                : "partial"
              : job?.status === "paused"
                ? "paused"
                : job?.status === "failed" || job?.status === "cancelled"
                  ? "failed"
                  : "extracting",
          ...(job?.status === "failed"
            ? { error: "Saved · extraction failed. Retry or undo." }
            : {}),
          leaseUntil: 0,
          nextAt: Date.now() + 5000,
          attempts: 0,
        });
      } catch (error) {
        const row = await current();
        const expired =
          error && typeof error === "object" && "status" in error && error.status === 410;
        if (row.undo && expired) await update({ phase: "undone", leaseUntil: 0 });
        else {
          const attempts = (row.attempts ?? 0) + 1;
          await update({
            phase: attempts >= 5 || expired ? "failed" : "waiting",
            error: error instanceof Error ? error.message : "Capture failed. Retry or undo.",
            attempts,
            leaseUntil: 0,
            nextAt:
              row.undo && !work.undo
                ? 0
                : Date.now() + Math.min(30 * 60_000, 15_000 * 2 ** (attempts - 1)),
          });
        }
      } finally {
        clearInterval(poll);
      }
    }
  } catch {
    await bridge.captureDefer();
  } finally {
    clearTimeout(timer);
    await disposeClientRuntime(runtime);
    await bridge.captureFinished();
  }
}
