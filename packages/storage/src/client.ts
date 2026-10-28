import { DirectSourceUpload, LibraryFile } from "@avenire/contracts";
import { createFilesClient } from "files-sdk/client";
import * as Schema from "effect/Schema";

export class SourceUploadTransferError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly stage: "create" | "transfer" | "verify";
  constructor(status: number, detail: string, stage: "create" | "transfer" | "verify") {
    super(`${detail} (HTTP ${status})`);
    this.name = "SourceUploadTransferError";
    this.status = status;
    this.detail = detail;
    this.stage = stage;
  }
}

/** The application owns tickets/publication; files-sdk owns byte transport and progress. */
export async function uploadSourceTicket(
  endpoint: URL,
  body: Blob,
  options: {
    contentType: string;
    appFetch?: (url: string, init: RequestInit) => Promise<Response>;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
    onVerifying?: () => void;
  },
): Promise<LibraryFile> {
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error("Unexpected upload destination.");
  let saved: LibraryFile | undefined;
  const signal = options.signal ?? AbortSignal.timeout(15 * 60_000);
  const destination = (value: string) => {
    const url = new URL(value, endpoint);
    if (url.username || url.password || url.hash)
      throw new Error("Unexpected storage upload destination.");
    if (url.origin === endpoint.origin) {
      if (url.pathname !== endpoint.pathname || url.search)
        throw new Error("Unexpected upload destination.");
    } else if (url.protocol !== "https:") {
      throw new Error("Unexpected storage upload destination.");
    }
    return url;
  };
  const client = createFilesClient({
    endpoint: endpoint.href,
    fetchImpl: async (input, init = {}) => {
      const url = destination(input instanceof Request ? input.url : String(input));
      const application = url.origin === endpoint.origin;
      let completing = false;
      if (application && init.method === "POST" && typeof init.body === "string") {
        completing = (JSON.parse(init.body) as { op?: string }).op === "complete";
        if (completing) options.onVerifying?.();
      }
      const request = {
        ...init,
        signal,
        redirect: "error" as const,
        credentials: application ? ("include" as const) : ("omit" as const),
      };
      const response =
        application && options.appFetch
          ? await options.appFetch(url.href, request)
          : await fetch(url, request);
      if (!response.ok && application) {
        const detail: unknown = await response
          .clone()
          .json()
          .catch(() => null);
        const message =
          detail &&
          typeof detail === "object" &&
          "error" in detail &&
          typeof detail.error === "string"
            ? detail.error
            : detail &&
                typeof detail === "object" &&
                "message" in detail &&
                typeof detail.message === "string"
              ? detail.message
              : "Upload failed.";
        throw new SourceUploadTransferError(
          response.status,
          message.slice(0, 300),
          completing ? "verify" : init.method === "PUT" ? "transfer" : "create",
        );
      }
      // Validate before the SDK can hand a signed target to its browser XHR transport too.
      if (application && !completing && init.method === "POST" && response.ok) {
        const result = (await response.clone().json()) as { uploads: Array<{ target: unknown }> };
        for (const upload of result.uploads) {
          const target = Schema.decodeUnknownSync(DirectSourceUpload)(upload.target);
          destination(target.url);
        }
      }
      if (completing && response.ok) {
        const result = (await response.clone().json()) as { sourceFile?: unknown };
        saved = Schema.decodeUnknownSync(LibraryFile)(result.sourceFile);
      }
      return response;
    },
  });
  await client.upload(body, {
    contentType: options.contentType,
    signal,
    onProgress: ({ loaded, total }) => options.onProgress?.(loaded, total),
  });
  if (!saved) throw new Error("The server did not verify the uploaded source.");
  return saved;
}
