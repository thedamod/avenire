/** A provider capability never receives application cookies, redirects, or source credentials. */
export function sourceUploadUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    !/^[a-z0-9]+\.ingest\.uploadthing\.com$/.test(url.hostname)
  )
    throw new Error("Unexpected storage upload destination");
  return url;
}

/** Older servers reject the new hint. Retry only that exact schema mismatch, with the same identity. */
export async function requestSourceTicket(
  send: (body: string) => Promise<Response>,
  payload: Record<string, unknown>,
): Promise<Response> {
  const response = await send(JSON.stringify(payload));
  if (response.status !== 400 || payload.transport !== "direct") return response;
  let detail: unknown;
  try {
    detail = await response.clone().json();
  } catch {
    return response;
  }
  const error =
    detail && typeof detail === "object" && "error" in detail ? detail.error : undefined;
  if (typeof error !== "string" || !/Invalid request parameters \(transport\)/.test(error))
    return response;
  const { transport: _hint, ...legacy } = payload;
  void response.body?.cancel().catch(() => {});
  return send(JSON.stringify(legacy));
}

export async function transferDirectSource(
  url: string,
  file: Blob,
  options: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    send?: (url: string, body: FormData, offset: number, signal: AbortSignal) => Promise<Response>;
  } = {},
): Promise<void> {
  const target = sourceUploadUrl(url).href;
  const fetcher = options.fetcher ?? fetch;
  const signal = options.signal ?? AbortSignal.timeout(15 * 60_000);
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    try {
      const head = await fetcher(target, {
        method: "HEAD",
        credentials: "omit",
        redirect: "error",
        signal,
      });
      if (!head.ok && head.status !== 404) throw new TransferStatus(head.status);
      const raw = head.headers.get("x-ut-range-start") ?? "0";
      const offset = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(offset) || offset > file.size)
        throw new Error("Invalid storage upload offset");
      options.onProgress?.(offset, file.size);
      if (offset === file.size) return;
      const body = new FormData();
      body.append("file", file.slice(offset));
      const response = options.send
        ? await options.send(target, body, offset, signal)
        : await fetcher(target, {
            method: "PUT",
            body,
            headers: { Range: `bytes=${offset}-` },
            credentials: "omit",
            redirect: "error",
            signal,
          });
      if (!response.ok) throw new TransferStatus(response.status);
      // UFS can report a provider failure inside an otherwise successful JSON response.
      const result: unknown = await response.json();
      if (result && typeof result === "object" && "error" in result)
        throw new Error("Storage rejected the file");
      options.onProgress?.(file.size, file.size);
      return;
    } catch (error) {
      if (
        signal.aborted ||
        attempt >= 2 ||
        (error instanceof TransferStatus &&
          error.status < 500 &&
          error.status !== 408 &&
          error.status !== 429) ||
        !(error instanceof TypeError || error instanceof TransferStatus)
      )
        throw error;
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const timer = setTimeout(done, 300 * 2 ** attempt);
        const abort = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
}
class TransferStatus extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Storage transfer failed (${status})`);
    this.status = status;
  }
}
