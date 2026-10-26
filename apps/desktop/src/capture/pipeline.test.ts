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
  expect(h.stream.events.find((event) => event.key === "window:0")?.status).toBe("uploading");
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
