/** Public-source network boundary shared by page, caption and media acquisition. */
import { lookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import { checkServerIdentity } from "node:tls";
import type { Duplex } from "node:stream";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class AcquisitionError extends Schema.TaggedError<AcquisitionError>()("AcquisitionError", {
  reason: Schema.Literals(["url", "address", "redirect", "size", "timeout", "network"]),
  cause: Schema.Defect(),
  status: Schema.optionalKey(Schema.Number),
}) {}

export interface PublicAddress {
  readonly address: string;
  readonly family: number;
}
export type PublicResolver = (hostname: string) => Promise<ReadonlyArray<PublicAddress>>;
const resolve: PublicResolver = (hostname) => lookup(hostname, { all: true, verbatim: true });
const error = (reason: AcquisitionError["reason"], cause: unknown) =>
  new AcquisitionError({ reason, cause });

/** Conservative global-unicast policy; special-use and transition ranges are denied. */
export const isPublicAddress = (address: string): boolean => {
  if (net.isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      address === "168.63.129.16" || // Azure platform/WireServer is reachable on a public-looking IP.
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (net.isIP(address) !== 6) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const words = normalized.split(":");
  const first = Number.parseInt(words[0] ?? "0", 16);
  const second = Number.parseInt(words[1] || "0", 16);
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 && // 6to4 embeds an arbitrary IPv4 destination
    !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) &&
    !(first === 0x3fff && second <= 0xfff)
  );
};

export const publicUrl = (input: string): URL => {
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw error("url", cause);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.port ||
    url.href.length > 16_384
  ) {
    throw error("url", "Only credential-free HTTP(S) URLs on their default ports are allowed");
  }
  const host = url.hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host || host === "localhost" || /\.(?:localhost|local|internal|home|lan|onion)$/.test(host))
    throw error("address", "Local hostnames are not public sources");
  if (net.isIP(host) && !isPublicAddress(host)) throw error("address", "Non-public IP address");
  return url;
};

/** DNS is resolved once and the validated address is used as the socket destination. */
export const resolvePublic = async (url: URL, resolver: PublicResolver = resolve) => {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw error("address", "DNS contains a non-public destination");
  return addresses[0]!;
};

export interface AcquisitionOptions {
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly maxRedirects?: number;
  readonly resolver?: PublicResolver;
  readonly signal?: AbortSignal;
}

/** Race uncooperative DNS/body promises against the same deadline and remove listeners. */
const abortable = async <A>(promise: Promise<A>, signal: AbortSignal): Promise<A> => {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
};

const pinnedRequest = (url: URL, address: PublicAddress, options: http.RequestOptions) =>
  (url.protocol === "https:" ? https : http).request({
    ...options,
    protocol: url.protocol,
    hostname: address.address,
    family: address.family,
    port: url.protocol === "https:" ? 443 : 80,
    path: url.pathname + url.search,
    // Preserve the origin's certificate check and virtual-host routing, while pinning TCP.
    ...(url.protocol === "https:" && !net.isIP(url.hostname.replace(/^\[|\]$/g, ""))
      ? { servername: url.hostname }
      : {}),
    ...(url.protocol === "https:"
      ? {
          checkServerIdentity: (_host: string, certificate: import("node:tls").PeerCertificate) =>
            checkServerIdentity(url.hostname.replace(/^\[|\]$/g, ""), certificate),
        }
      : {}),
    headers: { ...options.headers, host: url.host },
    agent: false,
  });

/** Bounded fetch-compatible adapter, including redirect, DNS, body and whole-request deadlines. */
export const publicFetch = async (
  input: string | URL | Request,
  init?: RequestInit,
  options: AcquisitionOptions = {},
): Promise<Response> => {
  const request = new Request(input, init);
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 30_000);
  const signal = AbortSignal.any([
    request.signal,
    deadline,
    ...(options.signal ? [options.signal] : []),
  ]);
  try {
    let url = publicUrl(request.url);
    let method = request.method;
    if (!["GET", "HEAD", "POST"].includes(method)) throw error("url", "Unsupported source method");
    const headers = Object.fromEntries(request.headers);
    // Avoid decompression bombs. Downloads are consumed as bytes, never transparently inflated.
    headers["accept-encoding"] = "identity";
    delete headers.host;
    let body: Buffer | undefined;
    if (request.body !== null) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await abortable(reader.read(), signal);
          if (done) break;
          size += value.length;
          if (size > 1024 * 1024) throw error("size", "Source request body exceeds 1 MiB");
          chunks.push(value);
        }
        body = Buffer.concat(chunks, size);
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    if (body && body.length > 1024 * 1024) throw error("size", "Source request body exceeds 1 MiB");
    for (let hop = 0; ; hop++) {
      const address = await abortable(resolvePublic(url, options.resolver), signal);
      signal.throwIfAborted();
      const response = await new Promise<http.IncomingMessage>((accept, reject) => {
        const outgoing = pinnedRequest(url, address, { method, headers, signal });
        outgoing.once("response", accept);
        outgoing.once("error", reject);
        outgoing.end(body);
      });
      const status = response.statusCode ?? 502;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location) {
        response.destroy();
        if (hop >= (options.maxRedirects ?? 5))
          throw error("redirect", "Too many source redirects");
        const next = publicUrl(new URL(location, url).href);
        if (next.origin !== url.origin) {
          delete headers.authorization;
          delete headers.cookie;
        }
        if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          delete headers["content-type"];
          delete headers["content-length"];
        }
        url = next;
        continue;
      }
      if (
        response.headers["content-encoding"] &&
        response.headers["content-encoding"] !== "identity"
      ) {
        response.destroy();
        throw error("size", "Compressed source responses are not accepted");
      }
      const declared = Number(response.headers["content-length"]);
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.destroy();
        throw error("size", "Source Content-Length exceeds the byte budget");
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response) {
        total += chunk.length;
        if (total > maxBytes) {
          response.destroy();
          throw error("size", "Source stream exceeds the byte budget");
        }
        chunks.push(chunk);
      }
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined)
          responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      return new Response(
        [101, 204, 205, 304].includes(status) || method === "HEAD"
          ? null
          : Buffer.concat(chunks, total),
        {
          status,
          headers: responseHeaders,
        },
      );
    }
  } catch (cause) {
    if (cause instanceof AcquisitionError) throw cause;
    throw error(signal.aborted ? "timeout" : "network", cause);
  }
};

/** Anonymous acquisition accepts no caller headers, cookies or authorization. */
export const acquireSource = (url: string, options: AcquisitionOptions = {}) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await publicFetch(url, undefined, {
        ...options,
        signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
      });
      if (!response.ok)
        throw new AcquisitionError({
          reason: "network",
          cause: `Source returned HTTP ${response.status}`,
          status: response.status,
        });
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type"),
      };
    },
    catch: (cause) => (cause instanceof AcquisitionError ? cause : error("network", cause)),
  });

export const acquireBytes = (url: string, options: AcquisitionOptions = {}) =>
  acquireSource(url, options).pipe(Effect.map((source) => source.bytes));

export interface PublicProxy {
  readonly url: string;
  readonly failure: () => AcquisitionError | undefined;
  readonly close: () => Promise<void>;
}

/**
 * A per-process forward/CONNECT proxy. Every socket pins freshly validated public DNS.
 * TLS payloads stay opaque; byte budgets count encrypted traffic across all tunnels.
 * Only the trusted metadata-only yt-dlp process receives this URL, never user code.
 */
export const startPublicProxy = async (options: AcquisitionOptions = {}): Promise<PublicProxy> => {
  const sockets = new Set<Duplex>();
  let failure: AcquisitionError | undefined;
  let received = 0;
  let requests = 0;
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal;
  const deny = (cause: unknown) => {
    failure ??= cause instanceof AcquisitionError ? cause : error("network", cause);
    if (!controller.signal.aborted) controller.abort(failure);
    for (const socket of sockets) socket.destroy();
    // Expiry revokes the listener as well as existing tunnels. No usable gateway survives.
    if (server.listening) server.close();
  };
  const track = (socket: Duplex) => {
    if (signal.aborted) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.on("error", () => {}); // Stream errors are reported by their request/connection boundary.
    socket.once("close", () => sockets.delete(socket));
  };
  const count = (chunk: Buffer) => {
    received += chunk.length;
    if (received > (options.maxBytes ?? 20 * 1024 * 1024))
      deny(error("size", "Metadata proxy byte budget exceeded"));
  };
  const authorize = async (input: string) => {
    if (failure) throw failure;
    if (++requests > 100) throw error("redirect", "Metadata request budget exceeded");
    const url = publicUrl(input);
    const address = await abortable(resolvePublic(url, options.resolver), signal);
    signal.throwIfAborted();
    return { url, address };
  };
  const server = http.createServer((incoming, outgoing) => {
    incoming.once("error", deny);
    outgoing.once("error", deny);
    void (async () => {
      const { url, address } = await authorize(incoming.url ?? "");
      if (url.protocol !== "http:" || !["GET", "HEAD", "POST"].includes(incoming.method ?? ""))
        throw error("url", "Unsupported proxy request");
      const headers = { ...incoming.headers };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      headers["accept-encoding"] = "identity";
      const remote = pinnedRequest(url, address, {
        method: incoming.method ?? "GET",
        headers,
        signal,
      });
      remote.on("socket", track);
      outgoing.once("close", () => remote.destroy());
      remote.once("error", (cause) => {
        deny(cause);
        outgoing.destroy();
      });
      remote.once("response", (response) => {
        response.once("error", (cause) => {
          deny(cause);
          outgoing.destroy();
        });
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.on("data", count);
        response.pipe(outgoing);
      });
      incoming.on("data", count);
      incoming.pipe(remote);
    })().catch((cause) => {
      deny(cause);
      outgoing.destroy();
    });
  });
  server.on("connection", track);
  server.on("connect", (incoming, socket, head) => {
    void (async () => {
      const authority = incoming.url ?? "";
      if (!authority.endsWith(":443")) throw error("url", "CONNECT is limited to HTTPS port 443");
      const { address } = await authorize(`https://${authority}/`);
      const upstream = net.connect({ host: address.address, family: address.family, port: 443 });
      track(upstream);
      socket.once("close", () => upstream.destroy());
      upstream.once("close", () => socket.destroy());
      upstream.once("error", deny);
      upstream.once("connect", () => {
        if (failure || signal.aborted) {
          upstream.destroy();
          socket.destroy();
          return;
        }
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) {
          count(head);
          if (!failure) upstream.write(head);
        }
        socket.on("data", count);
        upstream.on("data", count);
        socket.pipe(upstream).pipe(socket);
      });
    })().catch((cause) => {
      deny(cause);
      socket.destroy();
    });
  });
  const deadline = setTimeout(
    () => deny(error("timeout", "Metadata proxy deadline exceeded")),
    options.timeoutMs ?? 45_000,
  );
  deadline.unref();
  const onAbort = () => deny(error("timeout", signal.reason));
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    signal.throwIfAborted();
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", accept);
    });
    signal.throwIfAborted();
    const address = server.address();
    if (!address || typeof address === "string")
      throw error("network", "Proxy did not bind a TCP port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      failure: () => failure,
      close: () =>
        new Promise<void>((accept) => {
          clearTimeout(deadline);
          signal.removeEventListener("abort", onAbort);
          controller.abort(error("network", "Metadata proxy closed"));
          for (const socket of sockets) socket.destroy();
          server.close(() => accept());
        }),
    };
  } catch (cause) {
    clearTimeout(deadline);
    signal.removeEventListener("abort", onAbort);
    controller.abort(cause);
    for (const socket of sockets) socket.destroy();
    server.close();
    throw cause;
  }
};
