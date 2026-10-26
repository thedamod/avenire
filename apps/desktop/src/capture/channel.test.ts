import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { CapturedTab, ExtensionAuth, PageSnapshot } from "@avenire/contracts";
import { encodeFileFrame } from "@avenire/capture/frames";
import { PairingAuthority } from "./pairing.ts";
import {
  startTabsReceiver,
  stopTabsReceiver,
  extensionChannel,
  latestTabs,
  resetTabsOwner,
} from "./tabs.ts";
vi.mock("../config.ts", () => ({
  extensionReceiverPort: 0,
  extensionIds: new Set(["gdegpabcfhonkcnecpgaekplbfmopace"]),
}));
const origin = "chrome-extension://gdegpabcfhonkcnecpgaekplbfmopace";
const token = "A".repeat(43);
const tab: CapturedTab = {
  tabId: 1,
  windowId: 1,
  browser: "chrome",
  url: "https://example.com/study",
  title: "Study",
  activeInWindow: true,
  engagement: { dwellMs: 9000, scrollDepthPct: 0, mediaPlaying: false },
};
const page: PageSnapshot = {
  tabId: 1,
  url: tab.url,
  title: tab.title,
  description: "Abstract",
  language: "en",
  text: "Study content",
  textLength: 13,
  truncated: false,
  signals: { visibleTextLength: 13, passwordInput: false, paywallContainers: [] },
};
const directories: string[] = [];
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  stopTabsReceiver();
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "capture-channel-test-"));
  directories.push(directory);
  const pairing = new PairingAuthority(join(directory, "pairings.json"));
  await pairing.load();
  pairing.setOwner("alice");
  pairing.setToken("alice", token);
  const server = startTabsReceiver(pairing);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return { pairing, url: `ws://127.0.0.1:${address.port}/ws`, channel: extensionChannel! };
}
async function client(url: string, source = origin) {
  const socket = new WebSocket(url, { origin: source });
  sockets.push(socket);
  socket.on("error", () => {});
  const messages: any[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await once(socket, "open");
  return {
    socket,
    messages,
    send: (value: unknown) => socket.send(JSON.stringify(value)),
    async next(tag: string) {
      await vi.waitFor(() => expect(messages.some((message) => message._tag === tag)).toBe(true));
      const index = messages.findIndex((message) => message._tag === tag);
      return messages.splice(index, 1)[0];
    },
  };
}
async function authenticate(
  c: Awaited<ReturnType<typeof client>>,
  auth: ExtensionAuth = { _tag: "Token", token },
) {
  c.send({
    _tag: "Hello",
    version: 1,
    senderId: "profile",
    browser: "chrome",
    extensionVersion: "0.1",
    auth,
  });
  return c.next("Welcome");
}
async function report(c: Awaited<ReturnType<typeof client>>, tabs: readonly CapturedTab[] = [tab]) {
  c.send({ _tag: "TabsReport", version: 1, tabs });
  await vi.waitFor(() =>
    expect(latestTabs()).toHaveLength(tabs.filter((tab) => !tab.incognito).length),
  );
}

it("authenticates token, code and persisted secret; rejects mismatched, reused and unsupported Hellos", async () => {
  const h = await harness();
  const a = await client(h.url);
  expect(await authenticate(a)).toEqual({ _tag: "Welcome", version: 1 });
  const b = await client(h.url);
  const code = h.pairing.issueCode();
  const welcome = await authenticate(b, { _tag: "Code", code });
  expect(welcome.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const c = await client(h.url);
  await authenticate(c, { _tag: "Secret", secret: welcome.secret });
  for (const auth of [
    { _tag: "Token", token: "B".repeat(43) },
    { _tag: "Code", code },
    { _tag: "Secret", secret: "C".repeat(43) },
  ] as ExtensionAuth[]) {
    const invalid = await client(h.url);
    invalid.send({
      _tag: "Hello",
      version: 1,
      senderId: "bad",
      browser: "chrome",
      extensionVersion: "0.1",
      auth,
    });
    expect((await invalid.next("Rejected")).reason).toBe(
      auth._tag === "Token" ? "account-mismatch" : "unpaired",
    );
    await vi.waitFor(() => expect(invalid.socket.readyState).toBe(WebSocket.CLOSED));
  }
  const old = await client(h.url);
  old.send({ _tag: "Hello", version: 99 });
  expect((await old.next("Rejected")).reason).toBe("unsupported-version");
});

it("enforces extension Origin, JSON size, socket cleanup and account isolation", async () => {
  const h = await harness();
  await expect(client(h.url, "https://evil.test")).rejects.toThrow();
  const c = await client(h.url);
  await authenticate(c);
  await report(c, [tab, { ...tab, tabId: 2, incognito: true }]);
  expect(h.channel.connected()).toBe(true);
  c.socket.send(" ".repeat(1024 * 1024 + 1));
  await vi.waitFor(() => expect(c.socket.readyState).toBe(WebSocket.CLOSED));
  expect(latestTabs()).toEqual([]);
  expect(h.channel.connected()).toBe(false);
  const other = await client(h.url);
  await authenticate(other);
  await report(other);
  resetTabsOwner();
  h.pairing.setOwner("bob");
  expect(h.channel.connected()).toBe(false);
  expect(latestTabs()).toEqual([]);
  const unpaired = await client(h.url);
  unpaired.send({
    _tag: "Hello",
    version: 1,
    senderId: "old",
    browser: "chrome",
    extensionVersion: "0.1",
    auth: { _tag: "Token", token },
  });
  expect((await unpaired.next("Rejected")).reason).toBe("account-mismatch");
});

it("correlates requests, extracts four tabs per batch, and passes readInBrowser", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const tabs = Array.from({ length: 7 }, (_, index) => ({
    ...tab,
    tabId: index + 1,
    url: `${tab.url}/${index}`,
  }));
  await report(c, tabs);
  const captured = h.channel.capture(tabs, false);
  const first = await c.next("CaptureRequest");
  expect(first.tabIds).toEqual([1, 2, 3, 4]);
  expect(first.readInBrowser).toBe(false);
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: first.requestId,
    pages: first.tabIds.map((tabId: number) => ({ ...page, tabId })),
    skipped: [],
  });
  const second = await c.next("CaptureRequest");
  expect(second.tabIds).toEqual([5, 6, 7]);
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: second.requestId,
    pages: second.tabIds.map((tabId: number) => ({ ...page, tabId })),
    skipped: [],
  });
  expect(await captured).toHaveLength(7);
  const reopened = h.channel.reopen(tab.url, { pdfPage: 3 });
  const request = await c.next("Reopen");
  c.send({ _tag: "ReopenResult", version: 1, requestId: request.requestId, ok: true });
  expect(await reopened).toBe(true);
});

it("spools multiple original files privately, verifies their bytes, and retains verified spools through disconnect", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  await report(c);
  const captured = h.channel.capture([tab], true);
  const request = await c.next("CaptureRequest");
  const originals = [
    Buffer.from("%PDF-original"),
    Buffer.from("Office original"),
    Buffer.from("%PDF-original"),
  ];
  const pages = originals.map((bytes, index) => ({
    ...page,
    text: "",
    file: {
      url: `${tab.url}/${index}.pdf`,
      fileName: `${index}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  }));
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    pages: [page, ...pages],
    skipped: [],
  });
  for (const [index, original] of originals.entries()) {
    const sha256 = pages[index]!.file.sha256;
    c.socket.send(
      encodeFileFrame(
        { requestId: request.requestId, tabId: 1, sha256, seq: 0, final: false },
        original.subarray(0, 3),
      ),
    );
    c.socket.send(
      encodeFileFrame(
        { requestId: request.requestId, tabId: 1, sha256, seq: 1, final: true },
        original.subarray(3),
      ),
    );
  }
  const results = await captured;
  expect(results).toHaveLength(4);
  c.socket.close();
  await once(c.socket, "close");
  for (const [index, result] of results.filter((result) => result.path).entries()) {
    expect(await readFile(result.path!)).toEqual(originals[index]);
    if (process.platform !== "win32") expect((await stat(result.path!)).mode & 0o777).toBe(0o600);
    await h.channel.release(result);
    await expect(stat(result.path!)).rejects.toThrow();
  }
});

it("rejects malformed frames, wrong sequence, hash mismatch and unsolicited capture results", async () => {
  for (const failure of ["frame", "sequence", "hash", "request"]) {
    const h = await harness();
    const c = await client(h.url);
    await authenticate(c);
    await report(c);
    const capture = h.channel.capture([tab], true);
    const request = await c.next("CaptureRequest");
    const sha256 = createHash("sha256").update("good").digest("hex");
    c.send({
      _tag: "CaptureResult",
      version: 1,
      requestId: failure === "request" ? "wrong" : request.requestId,
      pages: [
        {
          ...page,
          file: {
            url: tab.url,
            fileName: "study.pdf",
            mimeType: "application/pdf",
            sizeBytes: 4,
            sha256,
          },
        },
      ],
      skipped: [],
    });
    if (failure === "frame") c.socket.send(Buffer.from([0, 0]));
    if (failure === "sequence" || failure === "hash")
      c.socket.send(
        encodeFileFrame(
          {
            requestId: request.requestId,
            tabId: 1,
            sha256,
            seq: failure === "sequence" ? 1 : 0,
            final: true,
          },
          Buffer.from("evil"),
        ),
      );
    expect(await capture).toEqual([]);
    await vi.waitFor(() => expect(c.socket.readyState).toBe(WebSocket.CLOSED));
    expect(h.channel.connected()).toBe(false);
    stopTabsReceiver();
  }
});

it("enforces the 256 MiB per-file and aggregate contract limit before receiving bytes", async () => {
  for (const sizes of [[256 * 1024 * 1024 + 1], Array(5).fill(64 * 1024 * 1024)]) {
    const h = await harness();
    const c = await client(h.url);
    await authenticate(c);
    await report(c);
    const capture = h.channel.capture([tab], true);
    const request = await c.next("CaptureRequest");
    c.send({
      _tag: "CaptureResult",
      version: 1,
      requestId: request.requestId,
      pages: sizes.map((sizeBytes, index) => ({
        ...page,
        file: {
          url: tab.url,
          fileName: "study.pdf",
          mimeType: "application/pdf",
          sizeBytes,
          sha256: String(index).repeat(64),
        },
      })),
      skipped: [],
    });
    expect(await capture).toEqual([]);
    await vi.waitFor(() => expect(c.socket.readyState).toBe(WebSocket.CLOSED));
    stopTabsReceiver();
  }
});

it("bounds extraction to 2.5 seconds per batch and 4 seconds total, and reopen to 2 seconds", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const tabs = Array.from({ length: 12 }, (_, index) => ({ ...tab, tabId: index + 1 }));
  await report(c, tabs);
  const start = performance.now();
  expect(await h.channel.capture(tabs, true)).toEqual([]);
  expect(performance.now() - start).toBeLessThan(4400);
  const requests = c.messages.filter((message) => message._tag === "CaptureRequest");
  expect(requests).toHaveLength(2);
  const reopenStart = performance.now();
  expect(await h.channel.reopen(tab.url)).toBe(false);
  expect(performance.now() - reopenStart).toBeLessThan(2300);
}, 8000);
