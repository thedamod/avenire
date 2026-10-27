// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { DesktopChannel } from "./channel.ts";
import type { ExtensionMessage } from "@avenire/contracts";

class Socket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: Socket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | undefined;
  onclose: (() => void) | undefined;
  onerror: (() => void) | undefined;
  onmessage: ((event: { data: string }) => void) | undefined;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    Socket.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  message(value: ExtensionMessage): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}
const secret = "a".repeat(43);
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};
function setup() {
  const storage = {
    get: vi.fn(async () => ({ pairingSecret: secret })),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
  const request = vi.fn(async () => undefined);
  const changed = vi.fn();
  const channel = new DesktopChannel({
    appUrl: "https://avenire.example",
    senderId: "sender-1",
    browser: "chrome",
    storage: storage as unknown as chrome.storage.StorageArea,
    onRequest: request,
    changed,
  });
  channel.connect();
  const socket = Socket.instances.at(-1)!;
  return { channel, socket, storage, request, changed };
}
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("chrome", { runtime: { getManifest: () => ({ version: "0.1.0" }) } });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("desktop channel lifecycle", () => {
  it("authenticates with the stored secret, persists Welcome, and keeps alive every 20 s", async () => {
    const { channel, socket, storage } = setup();
    socket.open();
    await settle();
    expect(JSON.parse(socket.sent[0]!)).toMatchObject({
      _tag: "Hello",
      auth: { _tag: "Secret", secret },
    });
    expect(channel.state.connected).toBe(false);
    socket.message({ _tag: "Welcome", version: 1, secret: "b".repeat(43) });
    await settle();
    expect(storage.set).toHaveBeenCalledWith({ pairingSecret: "b".repeat(43) });
    expect(channel.state.connected).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ _tag: "Ping", version: 1 });
  });
  it("accepts requests only after authentication and ignores repeated request IDs", async () => {
    const { socket, request } = setup();
    socket.open();
    await settle();
    const capture: ExtensionMessage = {
      _tag: "CaptureRequest",
      version: 1,
      requestId: "request-1",
      readInBrowser: true,
    };
    socket.message(capture);
    expect(request).not.toHaveBeenCalled();
    socket.message({ _tag: "Welcome", version: 1 });
    await settle();
    socket.message(capture);
    socket.message(capture);
    await settle();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("refreshes metadata on desktop request without needing cached tab IDs", async () => {
    const { socket, request } = setup();
    socket.open();
    await settle();
    socket.message({ _tag: "Welcome", version: 1 });
    await settle();
    socket.message({ _tag: "TabsRequest", version: 1 });
    await settle();
    expect(request).toHaveBeenCalledWith({ _tag: "TabsRequest", version: 1 }, socket);
  });
  it("preserves reconnect backoff when heartbeat or wake calls connect again", async () => {
    const { channel, socket } = setup();
    socket.close();
    channel.connect();
    expect(Socket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(Socket.instances).toHaveLength(2);
    Socket.instances[1]!.close();
    channel.connect();
    await vi.advanceTimersByTimeAsync(1999);
    expect(Socket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(Socket.instances).toHaveLength(3);
  });
  it("offers a code after rejection and sends a fresh Hello with Code auth", async () => {
    const { channel, socket, storage } = setup();
    socket.open();
    await settle();
    socket.message({ _tag: "Rejected", version: 1, reason: "unpaired" });
    expect(channel.state.needsCode).toBe(true);
    expect(storage.remove).toHaveBeenCalledWith("pairingSecret");
    channel.pair("123456");
    const replacement = Socket.instances.at(-1)!;
    replacement.open();
    await settle();
    expect(JSON.parse(replacement.sent[0]!)).toMatchObject({
      _tag: "Hello",
      auth: { _tag: "Code", code: "123456" },
    });
  });
  it("authenticates the metadata HTTP fallback when the socket is down", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    const { channel } = setup();
    await channel.report([]);
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:17842/tabs",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body).toMatchObject({
      _tag: "TabsReport",
      version: 1,
      senderId: "sender-1",
      auth: { _tag: "Secret", secret },
      tabs: [],
    });
  });
});
