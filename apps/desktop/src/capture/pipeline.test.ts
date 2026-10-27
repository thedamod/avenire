import { expect, it, vi } from "vite-plus/test";
import type { CaptureSnapshot, CapturedTab, LibraryFile, PageSnapshot } from "@avenire/contracts";
import type { acquireAndUploadSource } from "./source-acquisition.ts";
import type { BrowserPage } from "./channel.ts";
import { captureItems, runCapturePipeline, tabKey } from "./pipeline.ts";
import { CaptureProgressStream } from "./progress.ts";
import { LocalOriginRegistry } from "./registry.ts";
const mocks = vi.hoisted(() => ({ acquire: vi.fn<typeof acquireAndUploadSource>() }));
vi.mock("./source-acquisition.ts", () => ({ acquireAndUploadSource: mocks.acquire }));
const tab: CapturedTab = {
  tabId: 1,
  windowId: 2,
  browser: "chrome",
  url: "https://example.com/study?course=physics&token=secret",
  title: "Study",
  activeInWindow: true,
  engagement: { dwellMs: 9000, scrollDepthPct: 20, mediaPlaying: false },
  selection: { exact: "A selected quote" },
  position: { pdfPage: 3 },
};
const page: PageSnapshot = {
  tabId: 1,
  url: "https://example.com/study?course=physics",
  canonicalUrl: "https://example.com/study?course=physics&utm_source=tracking",
  title: "Study",
  description: "Short abstract",
  language: "en",
  text: "Rendered content",
  textLength: 16,
  truncated: false,
  signals: { visibleTextLength: 16, passwordInput: false, paywallContainers: [] },
};
const snapshot: CaptureSnapshot = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CaptureSnapshot["id"],
  deviceId: "install",
  platform: "linux",
  capturedAt: "2026-10-26T00:00:00Z",
  tabs: [tab],
  windows: [],
  media: [],
  collectorNotes: [],
};
function setup(
  initial = snapshot,
  results: BrowserPage[] = [{ tab, page }],
  observedTabs: readonly CapturedTab[] = [],
) {
  const send = vi.fn();
  const stream = new CaptureProgressStream({ id: initial.id, items: captureItems(initial) }, send);
  const channel = {
    async capture(
      _tabs: readonly CapturedTab[],
      _read: boolean,
      _signal?: AbortSignal,
      onPage?: (result: BrowserPage) => Promise<void>,
    ) {
      await Promise.all(results.map((result) => onPage?.(result)));
      return results;
    },
    latestTabs: () => observedTabs,
    release: vi.fn(async () => {}),
  };
  return {
    initial: { snapshot: initial, blocked: [] },
    resolve: async () => initial,
    session: Promise.resolve(vi.fn()),
    appUrl: "https://app.test",
    owner: "alice",
    registry: new LocalOriginRegistry("/unused"),
    signal: new AbortController().signal,
    readInBrowser: true,
    stream,
    channel,
    send,
  };
}
const uploaded = (title = "Study") =>
  ({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title }) as LibraryFile;

it("starts immediately, uploads browser content while document resolution is pending and preserves selection candidates", async () => {
  let resolve!: (snapshot: CaptureSnapshot) => void;
  const initial = {
    ...snapshot,
    windows: [{ appName: "Preview", title: "Notes", foreground: true }],
  };
  const h = setup(initial);
  mocks.acquire.mockResolvedValue(uploaded());
  const run = runCapturePipeline({
    ...h,
    resolve: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  expect(h.send.mock.calls[0]![0]).toBe("avenire:capture-started");
  await vi.waitFor(() =>
    expect(h.stream.events.some((event) => event.status === "saved")).toBe(true),
  );
  resolve({ ...initial, windows: [{ ...initial.windows[0]!, filePath: "/private/Notes.pdf" }] });
  const result = await run;
  expect(result.uploads?.files).toHaveLength(2);
  expect(result.snapshot.windows).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("/private");
  expect(result.snapshot.tabs[0]?.selection).toEqual(tab.selection);
  expect(
    h.stream.events.some((event) => event.key === "window:0" && event.status === "uploading"),
  ).toBe(true);
  const [, metadata] = mocks.acquire.mock.calls[0]!;
  expect(metadata).toMatchObject({
    kind: "web-page",
    mimeType: "text/markdown",
    access: "open",
    origin: {
      _tag: "Web",
      url: "https://example.com/study?course=physics",
      canonicalUrl: "https://example.com/study?course=physics",
      position: { pdfPage: 3, textQuote: tab.selection },
    },
  });
});

it("shares one three-upload cap across native originals and browser markdown", async () => {
  const initial = {
    ...snapshot,
    tabs: Array.from({ length: 8 }, (_, index) => ({ ...tab, tabId: index, selection: undefined })),
    windows: Array.from({ length: 8 }, (_, index) => ({
      appName: "Preview",
      title: `Study ${index}`,
      foreground: true,
      filePath: `/private/${index}.pdf`,
    })),
  };
  const h = setup(
    initial,
    initial.tabs.map((tab) => ({ tab, page: { ...page, tabId: tab.tabId } })),
  );
  let active = 0;
  let peak = 0;
  mocks.acquire.mockImplementation(async (_source, metadata) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 3));
      return uploaded(metadata.title);
    } finally {
      active--;
    }
  });
  const result = await runCapturePipeline(h);
  expect(peak).toBe(3);
  expect(result.uploads?.files).toHaveLength(16);
  expect(h.stream.events.map((event) => event.seq)).toEqual(
    h.stream.events.map((_, index) => index + 1),
  );
});

it("keeps blocked access and summary in the final tab without uploading blocked content", async () => {
  const blockedPage = { ...page, signals: { ...page.signals, paywallContainers: ["paywall"] } };
  const h = setup(snapshot, [{ tab, page: blockedPage }]);
  const result = await runCapturePipeline(h);
  expect(mocks.acquire).not.toHaveBeenCalled();
  expect(result.snapshot.tabs[0]).toMatchObject({ access: "paywalled", summary: "Short abstract" });
  expect(result.snapshot.tabs[0]?.selection).toBeUndefined();
  expect(result.snapshot.tabs[0]?.position).toBeUndefined();
  expect(h.stream.events.at(-1)).toMatchObject({ key: tabKey(tab), status: "skipped" });
  const observation = setup(
    snapshot,
    [],
    [{ ...tab, access: "login-required", summary: "Sign in to read" }],
  );
  expect((await runCapturePipeline(observation)).snapshot.tabs[0]).toMatchObject({
    access: "login-required",
    summary: "Sign in to read",
  });
});

it("uploads verified browser originals by MIME without registering their temporary path", async () => {
  const original = {
    ...page,
    text: "",
    file: {
      url: "https://example.com/lecture.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      fileName: "lecture.pdf",
    },
  };
  const h = setup({ ...snapshot, tabs: [{ ...tab, selection: undefined }] }, [
    { tab: { ...tab, selection: undefined }, page: original, path: "/private/spool/original" },
  ]);
  mocks.acquire.mockResolvedValue(uploaded());
  const result = await runCapturePipeline(h);
  expect(result.snapshot.tabs).toEqual([]);
  expect(mocks.acquire.mock.calls[0]![0]).toEqual({
    type: "local-file",
    path: "/private/spool/original",
  });
  expect(mocks.acquire.mock.calls[0]![1]).toMatchObject({
    kind: "pdf",
    mimeType: "application/pdf",
    origin: { _tag: "Web", url: "https://example.com/lecture.pdf" },
  });
  expect(mocks.acquire.mock.calls[0]![2].onLocalUploaded).toBeUndefined();
  expect(h.channel.release).toHaveBeenCalledOnce();
});

it("keeps the blocklist during navigation and never uploads when reading in the browser is disabled", async () => {
  const h = setup(snapshot, [
    { tab, page: { ...page, url: "https://mail.google.com/mail/u/0", canonicalUrl: undefined } },
  ]);
  expect((await runCapturePipeline(h)).snapshot.tabs).toEqual([]);
  expect(mocks.acquire).not.toHaveBeenCalled();
  const off = setup();
  await runCapturePipeline({ ...off, readInBrowser: false });
  expect(mocks.acquire).not.toHaveBeenCalled();
  const badOriginal = setup(snapshot, [
    {
      tab,
      page: {
        ...page,
        file: {
          url: "https://mail.google.com/attachment",
          mimeType: "application/pdf",
          sizeBytes: 10,
          sha256: "a".repeat(64),
          fileName: "mail.pdf",
        },
      },
      path: "/private/spool",
    },
  ]);
  await runCapturePipeline(badOriginal);
  expect(mocks.acquire).not.toHaveBeenCalled();
  expect(badOriginal.channel.release).toHaveBeenCalledOnce();
});

it("includes every idle tab instantly and uploads a file tab as a private local source", async () => {
  const path = "C:\\Users\\<user>\\Downloads\\MATH U113 Course Handout.pdf";
  const fileTab = {
    ...tab,
    tabId: 2,
    url: "file:///C:/Users/<user>/Downloads/MATH%20U113%20Course%20Handout.pdf",
    title: path,
    activeInWindow: false,
    selection: undefined,
    position: undefined,
  };
  const native = {
    ...snapshot,
    platform: "win32" as const,
    tabs: [
      {
        ...tab,
        activeInWindow: false,
        engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
      },
      fileTab,
    ],
    windows: [{ appName: "Browser", title: path, filePath: path, foreground: false }],
  };
  const h = setup(native, []);
  expect(h.stream.started.items).toHaveLength(2);
  expect(h.stream.started.items.map((item) => item.title)).not.toContain(path);
  mocks.acquire.mockResolvedValue(uploaded("MATH U113 Course Handout.pdf"));
  const result = await runCapturePipeline(h);
  expect(mocks.acquire).toHaveBeenCalledWith(
    { type: "local-file", path },
    expect.anything(),
    expect.objectContaining({
      localOrigin: expect.objectContaining({
        _tag: "LocalFile",
        fileName: "MATH U113 Course Handout.pdf",
      }),
      onLocalUploaded: expect.any(Function),
    }),
  );
  expect(result.snapshot.tabs).toHaveLength(1);
  expect(result.snapshot.windows).toEqual([]);
  expect(JSON.stringify(result)).not.toMatch(/file:\/|C:|Downloads/);
  expect(h.stream.events).toContainEqual(
    expect.objectContaining({ key: tabKey(fileTab), status: "saved" }),
  );
});

it.each([
  "DiscordCanary",
  "DiscordDevelopment",
  "vendor.slackclient",
  "SIGNALDESKTOP",
  "PayPal",
  "WellsFargo",
  "discordcanary.exe",
  "slack.exe",
  "WhatsApp.Root",
  "Teams",
  "ms-teams",
  "Telegram Desktop",
  "1Password 7",
  "Bitwarden",
  "Thunderbird",
  "Outlook",
  "olk",
  "HxOutlook",
  "LastPass",
  "KeePassXC",
  "RoboForm",
  "iMessage",
  "WeChat",
])("excludes %s before started, progress and receipt", async (appName) => {
  const { applyPolicy } = await import("@avenire/capture/policy");
  const filtered = applyPolicy({
    ...snapshot,
    tabs: [],
    windows: [{ appName, title: "Private conversation with secret", foreground: true }],
    media: [{ appName, title: "Private conversation with secret" }],
  });
  expect(filtered.snapshot.windows).toEqual([]);
  const h = setup(filtered.snapshot, []);
  const result = await runCapturePipeline({ ...h, initial: filtered });
  expect(h.stream.started.items).toEqual([]);
  expect(h.stream.events).toEqual([]);
  expect(JSON.stringify([result, h.send.mock.calls])).not.toMatch(/Private conversation|secret/);
});
it("redacts file-tab failure receipts and never requests browser extraction for local files", async () => {
  const path = "C:\\Users\\student\\Downloads\\Private Course.pdf";
  const fileTab = {
    ...tab,
    url: "file:///C:/Users/student/Downloads/Private%20Course.pdf",
    title: path,
  };
  const h = setup(
    {
      ...snapshot,
      platform: "win32",
      tabs: [fileTab],
      windows: [
        {
          appName: "Browser",
          title: path,
          filePath: path,
          foreground: true,
        },
      ],
    },
    [],
  );
  mocks.acquire.mockRejectedValueOnce(new Error(path));
  const capture = vi.fn(async (tabs, _read, _signal, _page, failure) => {
    expect(tabs).toEqual([]);
    // A stale channel callback still uses the shared sanitized title.
    failure(fileTab, "Browser timed out");
    return [];
  });
  const result = await runCapturePipeline({ ...h, channel: { ...h.channel, capture } });
  expect(capture).toHaveBeenCalledOnce();
  const serialized = JSON.stringify([result, h.stream.started, ...h.stream.events]);
  expect(serialized).not.toMatch(/student|Downloads|C:|file:\/\//);
  expect(result.uploads?.skipped).toContainEqual({
    title: "Private Course.pdf",
    reason: "Browser timed out",
  });
});
it("matches Windows path aliases to one tab item and uploads one original", async () => {
  const fileTab = { ...tab, url: "file:///C:/Users/Student/Study.pdf", title: "Study" };
  const initial = {
    ...snapshot,
    platform: "win32" as const,
    tabs: [fileTab],
    windows: [
      {
        appName: "Browser",
        title: "Study",
        filePath: "c:/users/student/STUDY.pdf",
        foreground: true,
      },
      {
        appName: "Reader",
        title: "Study",
        filePath: "C:\\Users\\Student\\Study.pdf",
        foreground: false,
      },
    ],
  };
  const h = setup(initial, []);
  mocks.acquire.mockResolvedValueOnce(uploaded());
  const result = await runCapturePipeline(h);
  expect(h.stream.started.items).toHaveLength(1);
  expect(result.uploads?.files).toHaveLength(1);
  expect(
    h.stream.events.filter((event) => event.status === "saved").map((event) => event.key),
  ).toEqual([tabKey(fileTab)]);
});

it("uses embedded frame provenance for browser originals and reapplies policy to that frame", async () => {
  const filePage = {
    ...page,
    file: {
      url: "https://school.test/notes.pdf",
      originUrl: "https://school.test/embedded-viewer?lecture=1",
      mimeType: "application/pdf",
      fileName: "notes.pdf",
      sizeBytes: 10,
      sha256: "a".repeat(64),
    },
  };
  mocks.acquire.mockResolvedValue(uploaded());
  const h = setup(snapshot, [{ tab, page: filePage, path: "/private/spool" }]);
  await runCapturePipeline(h);
  expect(mocks.acquire.mock.calls[0]?.[1].origin).toMatchObject({
    _tag: "Web",
    url: "https://school.test/embedded-viewer?lecture=1",
  });
  const calls = mocks.acquire.mock.calls.length;
  const blocked = setup(snapshot, [
    {
      tab,
      page: { ...filePage, file: { ...filePage.file, originUrl: "https://mail.google.com/inbox" } },
      path: "/private/spool",
    },
  ]);
  await runCapturePipeline(blocked);
  expect(mocks.acquire).toHaveBeenCalledTimes(calls);
});

it("skips unread Drive tabs with a Needs you reason and retains ordinary timed-out URL candidates", async () => {
  const drive = {
    ...tab,
    tabId: 2,
    selection: undefined,
    url: "https://drive.google.com/file/d/abc/view",
  };
  const docs = {
    ...tab,
    tabId: 3,
    selection: undefined,
    url: "https://docs.google.com/document/d/abc/edit",
  };
  const h = setup({ ...snapshot, tabs: [drive, docs, { ...tab, selection: undefined }] }, []);
  h.channel.capture = async (_tabs, _read, _signal, _page, ...args: any[]) => {
    const failure = args[0];
    failure(drive, "Read in browser timed out");
    failure(docs, "Document returned a login or HTML page");
    failure(tab, "Read in browser timed out");
    return [];
  };
  const result = await runCapturePipeline(h);
  expect(result.snapshot.tabs.map((tab) => tab.url)).toEqual([tab.url]);
  expect(h.stream.events).toContainEqual(
    expect.objectContaining({
      key: tabKey(drive),
      status: "skipped",
      reason: "Read in browser timed out",
    }),
  );
  expect(h.stream.events).toContainEqual(
    expect.objectContaining({
      key: tabKey(docs),
      status: "skipped",
      reason: expect.stringContaining("Document returned a login or HTML page"),
    }),
  );
  expect(h.stream.events).toContainEqual(
    expect.objectContaining({
      key: tabKey(tab),
      status: "skipped",
      reason: "Read in browser timed out",
    }),
  );
});

it("uploads browser downloads as LocalFiles, records their private real path, and keeps the page URL for reopen", async () => {
  const path = "/Downloads/Avenire/request-id/Handout.pdf";
  const url = "https://school.test/files/123/download";
  const h = setup({ ...snapshot, tabs: [{ ...tab, selection: undefined }] }, [
    {
      tab: { ...tab, selection: undefined },
      path,
      downloadWindow: { captureId: "request-id", startedAt: 1, endedAt: 2 },
      page: {
        ...page,
        text: "",
        textLength: 0,
        download: {
          path,
          captureId: "request-id",
          url,
          sizeBytes: 10,
          mimeType: "application/pdf",
          primary: true,
          originUrl: tab.url,
        },
      },
    },
  ]);
  const record = vi.spyOn(h.registry, "record").mockResolvedValue();
  mocks.acquire.mockImplementation(async (source, metadata, options) => {
    expect(source).toEqual({ type: "local-file", path });
    expect(metadata).toMatchObject({
      sourceUrl: "https://example.com/study?course=physics",
      kind: "pdf",
    });
    expect(options.localOrigin).toMatchObject({
      _tag: "LocalFile",
      deviceId: "install",
      fileName: "Handout.pdf",
      originUrl: "https://example.com/study?course=physics",
    });
    const file = uploaded();
    await options.onLocalUploaded?.(file, {
      path,
      sizeBytes: 10,
      sha256: "a".repeat(64),
      mtimeMs: 1,
    });
    return file;
  });
  const result = await runCapturePipeline(h);
  expect(record).toHaveBeenCalledWith(
    "alice",
    expect.anything(),
    expect.objectContaining({
      path,
      originUrl: "https://example.com/study?course=physics",
      download: { captureId: "request-id", startedAt: 1, endedAt: 2, url, reportedPath: path },
    }),
  );
  expect(result.snapshot.tabs).toEqual([]);
  expect(result.uploads?.files).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain("/Downloads");
});

it.each([
  [
    "login-required",
    "Sign in to Google with the account that can open this file, then capture again.",
  ],
  [
    "Google Drive won't download this file right now (too many downloads). Open it in Drive later and capture again.",
    "Google Drive won't download this file right now (too many downloads). Open it in Drive later and capture again.",
  ],
  [
    "The owner turned off downloads for this file, so Avenire can't save a copy.",
    "The owner turned off downloads for this file, so Avenire can't save a copy.",
  ],
])("shows a readable Drive failure and downloading progress: %s", async (failure, expected) => {
  const drive = { ...tab, url: "https://drive.google.com/file/d/textbook/view" };
  const h = setup({ ...snapshot, tabs: [drive] }, []);
  h.channel.capture = async (_tabs, _read, _signal, _page, ...callbacks: any[]) => {
    callbacks[1](drive);
    expect(h.stream.events.at(-1)).toMatchObject({ key: tabKey(drive), status: "uploading" });
    callbacks[0](drive, failure);
    return [];
  };
  const result = await runCapturePipeline(h);
  expect(h.stream.events.at(-1)).toMatchObject({
    key: tabKey(drive),
    status: "skipped",
    reason: expected,
  });
  expect(JSON.stringify(h.stream.events)).not.toContain("login-required");
  expect(result.uploads?.skipped.every((item) => item.reason === expected)).toBe(true);
});
