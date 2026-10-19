import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class HttpRequestError extends Schema.TaggedError<HttpRequestError>()("HttpRequestError", {
  status: Schema.Int,
  message: Schema.String,
}) {}
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
/** Check bytes while reading: Content-Length alone does not constrain chunked bodies. */
export const readBoundedBody = Effect.fn("Http.readBoundedBody")((request: Request) =>
  Effect.tryPromise({
    try: async () => {
      const length = request.headers.get("content-length");
      if (length !== null && Number(length) > MAX_REQUEST_BYTES)
        throw new HttpRequestError({ status: 413, message: "Request body exceeds 2 MB." });
      const reader = request.body?.getReader();
      if (!reader) return new Uint8Array(0);
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          // eslint-disable-next-line no-await-in-loop -- Bound bytes before requesting the next chunk.
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_REQUEST_BYTES) {
            // eslint-disable-next-line no-await-in-loop -- Stop consuming the oversized request.
            await reader.cancel();
            throw new HttpRequestError({ status: 413, message: "Request body exceeds 2 MB." });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    },
    catch: (cause) =>
      cause instanceof HttpRequestError
        ? cause
        : new HttpRequestError({ status: 400, message: "The request body could not be read." }),
  }),
);

/** Reconstruct plain requests: framework proxies cannot expose native Request private slots. */
export const boundedRequest = Effect.fn("Http.boundedRequest")(function* (request: Request) {
  const bytes = request.body === null ? undefined : yield* readBoundedBody(request);
  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    signal: request.signal,
    ...(bytes === undefined ? {} : { body: bytes }),
  });
});

export const readJsonBody = Effect.fn("Http.readJsonBody")(function* (request: Request) {
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return yield* new HttpRequestError({
      status: 415,
      message: "Content-Type must be application/json.",
    });
  const bytes = yield* readBoundedBody(request);
  return yield* Effect.try({
    try: () => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    catch: () =>
      new HttpRequestError({ status: 400, message: "The request body must be valid JSON." }),
  });
});

export const attachmentDisposition = (name: string): string => {
  const fallback = name.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
};
