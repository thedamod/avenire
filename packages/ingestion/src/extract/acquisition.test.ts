import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { EventEmitter } from "node:events";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import type { DetailedPeerCertificate } from "node:tls";
import { Duplex, Readable } from "node:stream";
import {
  isPublicAddress,
  acquireSource,
  publicFetch,
  publicUrl,
  resolvePublic,
  startPublicProxy,
} from "./acquisition.ts";

vi.mock("node:http", async (original) => {
  const actual = await original<typeof import("node:http")>();
  return {
    ...actual,
    request: vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  };
});
vi.mock("node:https", async (original) => {
  const actual = await original<typeof import("node:https")>();
  return {
    ...actual,
    request: vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  };
});
vi.mock("node:net", async (original) => {
  const actual = await original<typeof import("node:net")>();
  return {
    ...actual,
    connect: vi.fn(() => {
      throw new Error("Unexpected upstream socket");
    }),
  };
});

const publicDNS = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
const mockResponse = (
  status: number,
  headers: Record<string, string> = {},
  body: string[] = ["ok"],
) => {
  vi.mocked(http.request).mockImplementationOnce(((options: http.RequestOptions) => {
    const request = new EventEmitter() as http.ClientRequest;
    request.destroy = (() => request) as typeof request.destroy;
    request.end = (() => {
      const response = Object.assign(Readable.from(body.map((text) => Buffer.from(text))), {
        statusCode: status,
        headers,
      });
      options.signal?.addEventListener("abort", () => response.destroy(new Error("aborted")), {
        once: true,
      });
      queueMicrotask(() => request.emit("response", response));
      return request;
    }) as typeof request.end;
    return request;
  }) as typeof http.request);
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("public source acquisition", () => {
  effectIt.effect("returns content metadata without session headers or redirect cookies", () =>
    Effect.gen(function* () {
      mockResponse(302, { location: "/document", "set-cookie": "session=remote-only" }, []);
      mockResponse(200, { "content-type": "application/pdf" }, ["%PDF-fixture"]);
      const result = yield* acquireSource("http://example.com/link", { resolver: publicDNS });
      expect(new TextDecoder().decode(result.bytes)).toBe("%PDF-fixture");
      expect(result.mimeType).toBe("application/pdf");
      expect(http.request).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(http.request).mock.calls) {
        expect(call[0]).toMatchObject({
          method: "GET",
          headers: { "accept-encoding": "identity", host: "example.com" },
        });
      }
    }),
  );

  it("denies non-public IPv4, IPv6, mapped, transition and special-use addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "168.63.129.16",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "198.18.0.1",
      "192.0.2.1",
      "::1",
      "::",
      "fc00::1",
      "fe80::1",
      "::ffff:8.8.8.8",
      "2002:808:808::1",
      "2001:db8::1",
      "2001::1",
      "64:ff9b::a00:1",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects credentials, local names, protocols, non-default ports and disguised IPs", () => {
    for (const url of [
      "file:///etc/passwd",
      "ftp://example.com/a",
      "http://user:pass@example.com",
      "http://localhost",
      "http://a.internal",
      "http://a.local.",
      "http://2130706433",
      "http://0x7f000001",
      "http://[::ffff:127.0.0.1]",
      "https://example.com:8080",
    ])
      expect(() => publicUrl(url), url).toThrow();
  });

  it("preserves ordinary public URLs, IPv6, default ports and signed query strings", () => {
    for (const input of [
      "https://example.com:443/media?q=a%2Fb&signature=x+y",
      "http://example.com:80/path",
      "https://[2606:4700:4700::1111]/dns-query",
    ])
      expect(publicUrl(input).href).toBe(new URL(input).href);
  });

  it("rejects mixed public/private DNS results", async () => {
    await expect(
      resolvePublic(publicUrl("http://example.com"), async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ reason: "address" });
  });

  it("pins the validated IP and preserves Host without another resolver call", async () => {
    mockResponse(200);
    const response = await publicFetch("http://example.com/path?q=1", undefined, {
      resolver: publicDNS,
    });
    expect(await response.text()).toBe("ok");
    expect(publicDNS).toHaveBeenCalledTimes(1);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "93.184.216.34",
        path: "/path?q=1",
        agent: false,
        headers: expect.objectContaining({ host: "example.com" }),
      }),
    );
  });

  it("pins HTTPS while preserving the origin TLS servername", async () => {
    mockResponse(200);
    vi.mocked(https.request).mockImplementationOnce(((options: http.RequestOptions) =>
      http.request(options)) as typeof https.request);
    await publicFetch("https://example.com", undefined, { resolver: publicDNS });
    expect(https.request).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "93.184.216.34", servername: "example.com" }),
    );
    const options = vi.mocked(https.request).mock.calls[0]![0] as https.RequestOptions;
    const certificate = { subjectaltname: "DNS:example.com" } as DetailedPeerCertificate;
    expect(options.checkServerIdentity!("93.184.216.34", certificate)).toBeUndefined();
    expect(
      options.checkServerIdentity!("93.184.216.34", {
        subjectaltname: "DNS:other.example",
      } as DetailedPeerCertificate),
    ).toBeInstanceOf(Error);
  });

  it("validates every redirect and blocks private literal and rebound DNS destinations", async () => {
    mockResponse(302, { location: "http://127.0.0.1/secret" });
    await expect(
      publicFetch("http://example.com", undefined, { resolver: publicDNS }),
    ).rejects.toMatchObject({ reason: "address" });
    expect(http.request).toHaveBeenCalledTimes(1);
    vi.mocked(http.request).mockClear();
    mockResponse(302, { location: "/next" });
    const resolver = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }]);
    await expect(publicFetch("http://example.com", undefined, { resolver })).rejects.toMatchObject({
      reason: "address",
    });
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it("bounds redirect loops and declared or streamed response bytes", async () => {
    mockResponse(302, { location: "/loop" });
    await expect(
      publicFetch("http://example.com", undefined, { resolver: publicDNS, maxRedirects: 0 }),
    ).rejects.toMatchObject({ reason: "redirect" });
    mockResponse(200, { "content-length": "100" });
    await expect(
      publicFetch("http://example.com", undefined, { resolver: publicDNS, maxBytes: 3 }),
    ).rejects.toMatchObject({ reason: "size" });
    mockResponse(200, {}, ["ab", "cd"]);
    await expect(
      publicFetch("http://example.com", undefined, { resolver: publicDNS, maxBytes: 3 }),
    ).rejects.toMatchObject({ reason: "size" });
  });

  it("strips origin credentials across redirects", async () => {
    mockResponse(302, { location: "http://other.example/next" });
    mockResponse(200);
    await publicFetch(
      "http://example.com",
      { headers: { authorization: "Bearer test", cookie: "session=test" } },
      { resolver: publicDNS },
    );
    const headers = (vi.mocked(http.request).mock.calls[1]![0] as http.RequestOptions).headers;
    expect(headers).not.toHaveProperty("authorization");
    expect(headers).not.toHaveProperty("cookie");
  });

  it("applies a deadline to unresponsive DNS without opening a connection", async () => {
    await expect(
      publicFetch("http://example.com", undefined, {
        resolver: () => new Promise(() => {}),
        timeoutMs: 15,
      }),
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(http.request).not.toHaveBeenCalled();
  });

  it("bounds outgoing streamed bodies and cancels them before connecting", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(512 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://example.com", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(publicFetch(request, undefined, { resolver: publicDNS })).rejects.toMatchObject({
      reason: "size",
    });
    expect(cancelled).toBe(true);
    expect(http.request).not.toHaveBeenCalled();
  });

  it("deadlines stalled outgoing bodies and propagates caller cancellation", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://example.com", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(
      publicFetch(request, undefined, { resolver: publicDNS, timeoutMs: 15 }),
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(cancelled).toBe(true);
    const controller = new AbortController();
    controller.abort();
    await expect(
      publicFetch("http://example.com", undefined, {
        resolver: publicDNS,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ reason: "timeout" });
    expect(http.request).not.toHaveBeenCalled();
  });

  it("aborts a response that stalls after headers", async () => {
    vi.mocked(http.request).mockImplementationOnce(((options: http.RequestOptions) => {
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = (() => request) as typeof request.destroy;
      request.end = (() => {
        const response = Object.assign(new Readable({ read() {} }), {
          statusCode: 200,
          headers: {},
        });
        options.signal?.addEventListener("abort", () => response.destroy(new Error("aborted")), {
          once: true,
        });
        queueMicrotask(() => request.emit("response", response));
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof http.request);
    await expect(
      publicFetch("http://example.com", undefined, { resolver: publicDNS, timeoutMs: 15 }),
    ).rejects.toMatchObject({ reason: "timeout" });
  });
});

// These requests use only a loopback proxy. DNS is injected and no upstream socket is allowed.
describe("metadata proxy", () => {
  const requestProxy = async (proxyUrl: string, path: string, method = "GET") => {
    const actual = await vi.importActual<typeof import("node:http")>("node:http");
    return new Promise<void>((accept) => {
      const request = actual.request(proxyUrl, { method, path });
      request.on("error", () => accept());
      request.on("response", (response) => {
        response.resume();
        response.on("end", accept);
        response.on("error", () => accept());
        response.on("aborted", () => accept());
      });
      request.on("connect", (_response, socket) => {
        socket.destroy();
        accept();
      });
      request.end();
    });
  };

  it("revokes the listener on expiry and closes idempotently", async () => {
    const proxy = await startPublicProxy({ timeoutMs: 15, resolver: publicDNS });
    try {
      await new Promise((accept) => setTimeout(accept, 30));
      expect(proxy.failure()).toMatchObject({ reason: "timeout" });
      await requestProxy(proxy.url, "http://example.com/");
      expect(http.request).not.toHaveBeenCalled();
    } finally {
      await proxy.close();
      await proxy.close();
    }
  });

  it("never returns a gateway for an already cancelled operation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(startPublicProxy({ signal: controller.signal })).rejects.toBeDefined();
    expect(http.request).not.toHaveBeenCalled();
  });

  it("denies private DNS for forward and CONNECT requests", async () => {
    for (const [path, method] of [
      ["http://example.com/", "GET"],
      ["example.com:443", "CONNECT"],
    ]) {
      const proxy = await startPublicProxy({
        resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      });
      try {
        await requestProxy(proxy.url, path!, method);
        expect(proxy.failure()).toMatchObject({ reason: "address" });
        expect(http.request).not.toHaveBeenCalled();
        expect(net.connect).not.toHaveBeenCalled();
      } finally {
        await proxy.close();
      }
    }
  });

  it("pins a CONNECT tunnel and destroys upstream sockets on close", async () => {
    const upstream = new Duplex({
      read() {},
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    vi.mocked(net.connect).mockImplementationOnce((() => {
      queueMicrotask(() => upstream.emit("connect"));
      return upstream;
    }) as unknown as typeof net.connect);
    const proxy = await startPublicProxy({ resolver: publicDNS });
    try {
      await requestProxy(proxy.url, "example.com:443", "CONNECT");
      expect(net.connect).toHaveBeenCalledWith({ host: "93.184.216.34", family: 4, port: 443 });
    } finally {
      await proxy.close();
    }
    expect(upstream.destroyed).toBe(true);
  });

  it("bounds forward-proxy response bytes", async () => {
    mockResponse(200, {}, ["a".repeat(100)]);
    const proxy = await startPublicProxy({ resolver: publicDNS, maxBytes: 10 });
    try {
      await requestProxy(proxy.url, "http://example.com/");
      expect(proxy.failure()).toMatchObject({ reason: "size" });
      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({ hostname: "93.184.216.34", agent: false }),
      );
    } finally {
      await proxy.close();
    }
  });

  it("expires pending DNS and never opens a socket when it resolves late", async () => {
    let resolve!: (addresses: { address: string; family: number }[]) => void;
    const controller = new AbortController();
    const proxy = await startPublicProxy({
      signal: controller.signal,
      resolver: () =>
        new Promise((accept) => {
          resolve = accept;
          queueMicrotask(() => controller.abort(new Error("test deadline")));
        }),
    });
    try {
      await requestProxy(proxy.url, "http://example.com/");
      resolve([{ address: "8.8.8.8", family: 4 }]);
      await new Promise((accept) => setTimeout(accept, 5));
      expect(proxy.failure()).toMatchObject({ reason: "timeout" });
      expect(http.request).not.toHaveBeenCalled();
    } finally {
      await proxy.close();
    }
  });
});
