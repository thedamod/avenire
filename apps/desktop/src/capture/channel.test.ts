import { once } from "node:events";
import { realpath, mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { CapturedTab, ExtensionAuth, PageSnapshot } from "@avenire/contracts";
import { encodeFileFrame } from "@avenire/capture/frames";
import { PairingAuthority } from "./pairing.ts";
import type { RegisteredDownload } from "./registry.ts";
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
async function harness(knownDownloads: () => readonly RegisteredDownload[] = () => []) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "capture-channel-test-")));
  directories.push(directory);
  const pairing = new PairingAuthority(join(directory, "pairings.json"));
  await pairing.load();
  pairing.setOwner("alice");
  pairing.setToken("alice", token);
  const server = startTabsReceiver(pairing, undefined, directory, knownDownloads);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return {
    directory,
    pairing,
    url: `ws://127.0.0.1:${address.port}/ws`,
    channel: extensionChannel!,
  };
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
      await vi.waitFor(() => expect(messages.some((message) => message._tag === tag)).toBe(true), {
        timeout: 5000,
      });
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
  // Wait for the actual close event and then the server-side drop; client close can precede cleanup.
  await vi.waitFor(
    () => {
      expect(c.socket.readyState).toBe(WebSocket.CLOSED);
      expect(h.channel.connected()).toBe(false);
      expect(latestTabs()).toEqual([]);
    },
    { timeout: 5000 },
  );
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

it("sends one request containing every tab and passes readInBrowser", async () => {
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
  expect(first.tabIds).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(first.readInBrowser).toBe(false);
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: first.requestId,
    pages: first.tabIds.map((tabId: number) => ({ ...page, tabId })),
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
  expect(results).toHaveLength(3);
  c.socket.close();
  await once(c.socket, "close");
  for (const [index, result] of results.filter((result) => result.path).entries()) {
    expect(await readFile(result.path!)).toEqual(originals[index]);
    if (process.platform !== "win32") expect((await stat(result.path!)).mode & 0o777).toBe(0o600);
    await h.channel.release(result);
    await expect(stat(result.path!)).rejects.toThrow();
  }
});

it("rejects malformed frames, wrong sequence and hash mismatch", async () => {
  for (const failure of ["frame", "sequence", "hash"]) {
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

it("skips oversized files without disconnecting and reserves up to 1 GiB across tabs", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const tabs = Array.from({ length: 6 }, (_, i) => ({ ...tab, tabId: i + 1 }));
  await report(c, tabs);
  const failures = vi.fn();
  const captured = h.channel.capture(tabs, true, undefined, undefined, failures);
  const request = await c.next("CaptureRequest");
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    final: false,
    pages: tabs.map((tab, i) => ({
      ...page,
      tabId: tab.tabId,
      file: {
        url: tab.url,
        primary: true,
        fileName: "study.pdf",
        mimeType: "application/pdf",
        sizeBytes: i === 0 ? 256 * 1024 * 1024 + 1 : 256 * 1024 * 1024,
        sha256: String(i).repeat(64),
      },
    })),
    skipped: [],
  });
  await vi.waitFor(() => expect(failures).toHaveBeenCalledTimes(2));
  const peer = [...(h.channel as any).peers][0];
  const pending = peer.requests.get(request.requestId);
  expect(pending.budget.bytes).toBe(1024 * 1024 * 1024);
  expect(pending.files.size).toBe(4);
  // Binary frames for rejected files are quietly discarded.
  c.socket.send(
    encodeFileFrame(
      { requestId: request.requestId, tabId: 1, sha256: "0".repeat(64), seq: 0, final: true },
      new Uint8Array([1]),
    ),
  );
  c.send({ _tag: "Ping", version: 1 });
  await c.next("Pong");
  expect(c.socket.readyState).toBe(WebSocket.OPEN);
  pending.timer._onTimeout();
  expect(await captured).toEqual([]);
});

it("uses one 20 second reading deadline and keeps reopen bounded to 2 seconds", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const tabs = Array.from({ length: 30 }, (_, index) => ({ ...tab, tabId: index + 1 }));
  await report(c, tabs);
  const failures = vi.fn();
  const captured = h.channel.capture(tabs, true, undefined, undefined, failures);
  const request = await c.next("CaptureRequest");
  expect(request.tabIds).toHaveLength(30);
  expect(request.deadlineMs).toBeGreaterThan(19_000);
  expect(request.deadlineMs).toBeLessThanOrEqual(20_000);
  const pending = [...(h.channel as any).peers][0].requests.get(request.requestId);
  expect(pending.timer._idleTimeout).toBe(request.deadlineMs);
  pending.timer._onTimeout();
  expect(await captured).toEqual([]);
  expect(failures).toHaveBeenCalledTimes(30);
  expect(failures.mock.calls[0]![1]).toBe("Read in browser timed out");
  const reopenStart = performance.now();
  expect(await h.channel.reopen(tab.url)).toBe(false);
  expect(performance.now() - reopenStart).toBeLessThan(2300);
});

it("drops an expired request's late result and file frames while a concurrent request completes", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  await report(c);
  const controller = new AbortController();
  const expired = h.channel.capture([tab], true, controller.signal);
  const first = await c.next("CaptureRequest");
  expect(first.deadlineMs).toBeGreaterThan(0);
  expect(first.deadlineMs).toBeLessThanOrEqual(20_000);
  const live = h.channel.capture([tab], true);
  const second = await c.next("CaptureRequest");
  // Exercise the timeout callback without advancing the socket heartbeat.
  const peers = (h.channel as any).peers as Set<any>;
  const pending = [...peers][0].requests.get(first.requestId);
  pending.timer._onTimeout();
  expect(await expired).toEqual([]);
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: first.requestId,
    pages: [page],
    skipped: [],
  });
  c.socket.send(
    encodeFileFrame(
      { requestId: first.requestId, tabId: 1, sha256: "a".repeat(64), seq: 0, final: true },
      new Uint8Array([1]),
    ),
  );
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: second.requestId,
    pages: [page],
    skipped: [],
  });
  expect(await live).toEqual([{ tab, page }]);
  expect(c.socket.readyState).toBe(WebSocket.OPEN);
  expect(h.channel.connected()).toBe(true);
});

it("streams 30 tabs and ten primary documents progressively, deduping partials and ignoring unknown tabs", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const tabs = Array.from({ length: 30 }, (_, i) => ({ ...tab, tabId: i + 1 }));
  await report(c, tabs);
  const saved: number[] = [];
  let final = false;
  const captured = h.channel.capture(tabs, true, undefined, async (result) => {
    if (result.path) expect((await readFile(result.path)).length).toBeGreaterThan(0);
    expect(final).toBe(false);
    saved.push(result.tab.tabId);
    await h.channel.release(result);
  });
  const request = await c.next("CaptureRequest");
  const partial = (pages: PageSnapshot[]) =>
    c.send({
      _tag: "CaptureResult",
      version: 1,
      requestId: request.requestId,
      pages,
      skipped: [],
      final: false,
    });
  partial([{ ...page, tabId: 999 }]);
  for (const tab of tabs) {
    const bytes = Buffer.from(`%PDF-${tab.tabId}`);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const result = {
      ...page,
      tabId: tab.tabId,
      ...(tab.tabId <= 10
        ? {
            file: {
              url: tab.url,
              primary: true,
              fileName: "document.pdf",
              mimeType: "application/pdf",
              sizeBytes: bytes.length,
              sha256,
            },
          }
        : {}),
    };
    partial([result]);
    if (result.file)
      c.socket.send(
        encodeFileFrame(
          { requestId: request.requestId, tabId: tab.tabId, sha256, seq: 0, final: true },
          bytes,
        ),
      );
    await vi.waitFor(() => expect(saved).toContain(tab.tabId));
    partial([result]);
  }
  expect(saved).toHaveLength(30);
  // Late duplicate metadata does not register a new spool or call onPage again.
  c.send({ _tag: "Ping", version: 1 });
  await c.next("Pong");
  final = true;
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    pages: [],
    skipped: [],
    final: true,
  });
  expect(await captured).toHaveLength(30);
  expect(saved).toHaveLength(30);
  expect(c.socket.readyState).toBe(WebSocket.OPEN);
});

it("caps discovered files per tab while exempting primary documents and preserving other tabs", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  const other = { ...tab, tabId: 2 };
  await report(c, [tab, other]);
  const failures = vi.fn();
  const captured = h.channel.capture([tab, other], true, undefined, undefined, failures);
  const request = await c.next("CaptureRequest");
  const bytes = Array.from({ length: 13 }, (_, i) => Buffer.from(`%PDF-${i}`));
  const pages = bytes.map((data, i) => ({
    ...page,
    tabId: i === 12 ? 2 : 1,
    file: {
      url: `${tab.url}/${i}.pdf`,
      primary: i === 0 || i === 12,
      fileName: `${i}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    },
  }));
  c.send({ _tag: "CaptureResult", version: 1, requestId: request.requestId, pages, skipped: [] });
  for (const [i, data] of bytes.entries())
    c.socket.send(
      encodeFileFrame(
        {
          requestId: request.requestId,
          tabId: pages[i]!.tabId,
          sha256: pages[i]!.file.sha256,
          seq: 0,
          final: true,
        },
        data,
      ),
    );
  const results = await captured;
  expect(results).toHaveLength(12);
  expect(results.filter((result) => result.page.file?.primary)).toHaveLength(2);
  expect(failures).toHaveBeenCalledTimes(1);
  expect(failures.mock.calls[0]![1]).toContain("limit");
  expect(c.socket.readyState).toBe(WebSocket.OPEN);
  await Promise.all(results.map((result) => h.channel.release(result)));
});

it("refreshes metadata from a paired browser with an empty cache and bounds an unanswered refresh", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  expect(h.channel.latestTabs()).toEqual([]);
  const refresh = h.channel.refreshTabs();
  await c.next("TabsRequest");
  c.send({ _tag: "TabsReport", version: 1, tabs: [tab] });
  await refresh;
  expect(h.channel.latestTabs()).toEqual([tab]);
  vi.useFakeTimers();
  try {
    const refresh = h.channel.refreshTabs(25);
    await vi.advanceTimersByTimeAsync(25);
    await refresh;
  } finally {
    vi.useRealTimers();
  }
});

it("accepts downloads only for an authenticated pending tab, reuses validated copies, and never deletes browser downloads", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  await report(c);
  const callback = vi.fn(async () => {});
  const pending = h.channel.capture([tab], true, undefined, callback);
  const request = await c.next("CaptureRequest");
  const path = join(h.directory, "Avenire", request.requestId, "Study.pdf");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "%PDF-original");
  const download = {
    path,
    captureId: request.requestId,
    sizeBytes: (await stat(path)).size,
    mimeType: "application/pdf",
    url: "https://school.test/file",
    originUrl: tab.url,
  };
  const resultMessage = {
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    pages: [{ ...page, download }],
    skipped: [],
  };
  c.send({ ...resultMessage, requestId: "unsolicited" });
  c.send({ ...resultMessage, pages: [{ ...page, tabId: 999, download }] });
  c.send({ _tag: "Ping", version: 1 });
  await c.next("Pong");
  expect(callback).not.toHaveBeenCalled();
  c.send(resultMessage);
  const results = await pending;
  expect(results[0]?.path).toBe(path);
  expect(callback).toHaveBeenCalledOnce();
  await h.channel.release(results[0]!);
  expect((await stat(path)).isFile()).toBe(true);
  const reused = h.channel.capture([tab], true);
  const next = await c.next("CaptureRequest");
  expect(next.reusableDownloads).toContain(path);
  c.send({ ...resultMessage, requestId: next.requestId });
  expect((await reused)[0]?.path).toBe(path);
  resetTabsOwner();
  h.pairing.setOwner("bob");
  h.pairing.setToken("bob", "B".repeat(43));
  const other = await client(h.url);
  await authenticate(other, { _tag: "Token", token: "B".repeat(43) });
  await report(other);
  const unauthorizedReuse = h.channel.capture([tab], true);
  const bob = await other.next("CaptureRequest");
  expect(bob.reusableDownloads).toEqual([]);
  other.send({ ...resultMessage, requestId: bob.requestId });
  expect(await unauthorizedReuse).toEqual([]);
});

it("reuses owner-registry downloads after an authenticated browser reconnects", async () => {
  const known: RegisteredDownload[] = [];
  const h = await harness(() => known);
  const c = await client(h.url);
  await authenticate(c);
  await report(c);
  const captured = h.channel.capture([tab], true);
  const request = await c.next("CaptureRequest");
  const path = join(h.directory, "Avenire", request.requestId, "Handout.pdf");
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "%PDF-original");
  const download = {
    path,
    captureId: request.requestId,
    sizeBytes: (await stat(path)).size,
    mimeType: "application/pdf",
    url: "https://school.test/file",
  };
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    pages: [{ ...page, download }],
    skipped: [],
  });
  const result = (await captured)[0]!;
  known.push({
    path,
    sizeBytes: download.sizeBytes,
    download: { ...result.downloadWindow!, url: download.url },
  });
  const closed = once(c.socket, "close");
  c.socket.close();
  await closed;
  const next = await client(h.url);
  await authenticate(next);
  await report(next);
  const reused = h.channel.capture([tab], true);
  const pending = await next.next("CaptureRequest");
  expect(pending.reusableDownloads).toContain(path);
  next.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: pending.requestId,
    pages: [{ ...page, download }],
    skipped: [],
  });
  expect((await reused)[0]?.path).toBe(path);
});

it("reports download progress only for a live request's selected, unsettled tabs", async () => {
  const h = await harness();
  const c = await client(h.url);
  await authenticate(c);
  await report(c);
  const progress = vi.fn();
  const captured = h.channel.capture([tab], true, undefined, undefined, undefined, progress);
  const request = await c.next("CaptureRequest");
  const event = {
    _tag: "CaptureProgress",
    version: 1,
    requestId: request.requestId,
    tabId: tab.tabId,
    bytesReceived: 1024,
  };
  c.send({ ...event, requestId: "unrelated-capture" });
  c.send({ ...event, tabId: 999 });
  c.send({ ...event, bytesReceived: 0 });
  c.send(event);
  await vi.waitFor(() => expect(progress).toHaveBeenCalledExactlyOnceWith(tab));
  c.send({
    _tag: "CaptureResult",
    version: 1,
    requestId: request.requestId,
    pages: [],
    skipped: [],
  });
  await captured;
  c.send(event);
  c.send({ _tag: "Ping", version: 1 });
  await c.next("Pong");
  expect(progress).toHaveBeenCalledOnce();
});
