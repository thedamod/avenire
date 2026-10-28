import { ExtensionMessage } from "@avenire/contracts";
import * as Schema from "effect/Schema";

// Match the desktop channel's message cap. File frames have a separate 256 KiB chunk cap.
export const MAX_MESSAGE_BYTES = 1024 * 1024;
export function decodeMessage(raw: unknown): ExtensionMessage | undefined {
  if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return undefined;
  try {
    return Schema.decodeUnknownSync(ExtensionMessage)(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Capture timed out")), Math.max(0, ms));
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 401 ? "Not signed in to Avenire" : `Avenire request failed (${status})`);
    this.status = status;
  }
}

export async function apiJson<S extends Schema.Top & { readonly DecodingServices: never }>(
  fetcher: typeof fetch,
  url: string,
  schema: S,
  init: RequestInit = {},
): Promise<S["Type"]> {
  const response = await fetcher(url, {
    ...init,
    credentials: "include",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new ApiError(response.status);
  return Schema.decodeUnknownSync(schema)(await response.json());
}
