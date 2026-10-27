import { afterEach, expect, it, vi } from "vite-plus/test";
import { downloadDocument, hideCaptureDownloads } from "./downloads.ts";
import { captureTabs } from "./capture.ts";
import { extractPage } from "@avenire/capture/extract";
import { discoverLinks } from "./documents.ts";
import type { PageSnapshot, CapturedTab } from "@avenire/contracts";

const page: PageSnapshot = {
  tabId: 7,
  url: "https://school.test/course",
  title: "Handout",
  text: "",
  textLength: 0,
  description: "",
  language: "",
  truncated: false,
  signals: { visibleTextLength: 0, passwordInput: false, paywallContainers: [] },
};
const hint = {
  url: "https://school.test/notes.pdf",
  name: "Notes.pdf",
  rank: 0,
  explicit: true,
  primary: true,
};
const budget = () => ({ urls: new Set<string>(), bytes: 0, count: 0 });
function harness() {
  const listeners = new Set<() => void>();
  let item: any = {
    id: 3,
    filename: "/Downloads/Avenire/capture-id/Notes.pdf",
    url: hint.url,
    finalUrl: hint.url,
    mime: "application/pdf",
    fileSize: 123,
    exists: true,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    state: "in_progress",
  };
  const downloads = {
    search: vi.fn(async (query: any) => (query.id ? [item] : [])),
    download: vi.fn(async () => item.id),
    cancel: vi.fn(async () => {}),
    setUiOptions: vi.fn(async () => {}),
    onChanged: {
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
    },
  };
  const api = { downloads } as unknown as typeof chrome;
  return {
    api,
    downloads,
    listeners,
    item: () => item,
    update: (value: any) => {
      item = { ...item, ...value };
      for (const listener of listeners) listener();
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("downloads with browser credentials, waits for complete, reports the absolute filename and removes listeners", async () => {
  const h = harness();
  const result = downloadDocument(
    h.api,
    hint,
    page,
    budget(),
    new AbortController().signal,
    "capture-id",
    0,
  );
  await vi.waitFor(() => expect(h.downloads.search).toHaveBeenCalledWith({ id: 3 }));
  h.update({ state: "complete" });
  expect((await result)?.download).toMatchObject({
    path: "/Downloads/Avenire/capture-id/Notes.pdf",
    sizeBytes: 123,
    mimeType: "application/pdf",
    originUrl: page.url,
    url: hint.url,
  });
  expect(h.downloads.download).toHaveBeenCalledWith({
    url: hint.url,
    filename: "Avenire/capture-id/Notes.pdf",
    conflictAction: "uniquify",
    saveAs: false,
  });
  expect(h.listeners.size).toBe(0);
});

it("does not miss completion before download() resolves", async () => {
  const h = harness();
  h.downloads.download.mockImplementation(async () => {
    h.update({ state: "complete" });
    return 3;
  });
  expect(
    (
      await downloadDocument(
        h.api,
        hint,
        page,
        budget(),
        new AbortController().signal,
        "capture-id",
        0,
      )
    )?.download,
  ).toBeDefined();
  expect(h.listeners.size).toBe(0);
});

it("reports interruptions and cancels a timed out download without leaking listeners", async () => {
  const h = harness();
  const interrupted = downloadDocument(
    h.api,
    hint,
    page,
    budget(),
    new AbortController().signal,
    "capture-id",
    0,
  );
  const rejection = expect(interrupted).rejects.toThrow(
    "Browser download interrupted: FILE_ACCESS_DENIED",
  );
  await vi.waitFor(() => expect(h.downloads.search).toHaveBeenCalledWith({ id: 3 }));
  h.update({ state: "interrupted", error: "FILE_ACCESS_DENIED" });
  await rejection;
  expect(h.listeners.size).toBe(0);
  h.update({ state: "in_progress" });
  const abort = new AbortController();
  const timeout = downloadDocument(h.api, hint, page, budget(), abort.signal, "capture-id", 0);
  const timedOut = expect(timeout).rejects.toThrow("Browser download timed out");
  await vi.waitFor(() => expect(h.listeners.size).toBe(1));
  abort.abort();
  await timedOut;
  expect(h.downloads.cancel).toHaveBeenCalledWith(3);
  expect(h.listeners.size).toBe(0);
});

it("reuses a newer existing Avenire copy and ignores stale or unapproved copies", async () => {
  const h = harness();
  h.update({ state: "complete" });
  h.downloads.search.mockImplementation(async () => [h.item()]);
  const output = await downloadDocument(
    h.api,
    hint,
    page,
    budget(),
    new AbortController().signal,
    "next-id",
    0,
    [h.item().filename],
  );
  expect(output?.download?.captureId).toBe("capture-id");
  expect(h.downloads.download).not.toHaveBeenCalled();
  expect(h.downloads.search).toHaveBeenCalledWith({
    url: hint.url,
    exists: true,
    state: "complete",
  });
  await downloadDocument(
    h.api,
    hint,
    page,
    budget(),
    new AbortController().signal,
    "next-id",
    Date.now() + 1000,
    [h.item().filename],
  );
  expect(h.downloads.download).toHaveBeenCalledOnce();
  await downloadDocument(
    h.api,
    hint,
    page,
    budget(),
    new AbortController().signal,
    "next-id",
    0,
    [],
  );
  expect(h.downloads.download).toHaveBeenCalledTimes(2);
});

it("restores download UI only after the last capture finishes", async () => {
  const h = harness();
  const restoreA = await hideCaptureDownloads(h.api);
  const restoreB = await hideCaptureDownloads(h.api);
  await restoreA();
  expect(h.downloads.setUiOptions.mock.calls).toEqual([[{ enabled: false }]]);
  await restoreB();
  expect(h.downloads.setUiOptions.mock.calls).toEqual([[{ enabled: false }], [{ enabled: true }]]);
});

it("uses downloads rather than fetch or binary frames when desktop is connected, and restores UI", async () => {
  const h = harness();
  h.update({ state: "complete" });
  const api = {
    ...h.api,
    scripting: {
      executeScript: vi.fn(async (input: any) => {
        if (input.func === extractPage) return [{ result: page }];
        if (input.func === discoverLinks) return [{ result: [hint] }];
        return [];
      }),
    },
  } as unknown as typeof chrome;
  const tab: CapturedTab = {
    tabId: 7,
    windowId: 1,
    browser: "chrome",
    title: "Handout",
    url: page.url,
    activeInWindow: true,
    engagement: { dwellMs: 10000, scrollDepthPct: 0, mediaPlaying: false },
  };
  const fetcher = vi.fn();
  const output = await captureTabs(api, [tab], true, {
    desktop: true,
    captureId: "capture-id",
    fetcher,
  });
  expect(output.pages[0]?.download?.path).toContain("Avenire/capture-id/");
  expect(output.files).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  expect(h.downloads.setUiOptions.mock.calls).toEqual([[{ enabled: false }], [{ enabled: true }]]);
});

it("restores UI after a download failure and keeps interruption reasons visible", async () => {
  const h = harness();
  h.update({ state: "interrupted", error: "NETWORK_FAILED" });
  const api = {
    ...h.api,
    scripting: { executeScript: vi.fn(async () => []) },
  } as unknown as typeof chrome;
  const tab: CapturedTab = {
    tabId: 7,
    windowId: 1,
    browser: "chrome",
    title: "Handout.pdf",
    url: hint.url,
    activeInWindow: true,
    engagement: { dwellMs: 10000, scrollDepthPct: 0, mediaPlaying: false },
  };
  const output = await captureTabs(api, [tab], true, { desktop: true, captureId: "capture-id" });
  expect(output.skipped).toContainEqual({
    tabId: 7,
    reason: "Browser download interrupted: NETWORK_FAILED",
  });
  expect(h.downloads.setUiOptions.mock.calls).toEqual([[{ enabled: false }], [{ enabled: true }]]);
});

it("cancels a stalled download at the per-tab deadline and restores UI", async () => {
  vi.useFakeTimers();
  const h = harness();
  const api = {
    ...h.api,
    scripting: { executeScript: vi.fn(async () => []) },
  } as unknown as typeof chrome;
  const tab: CapturedTab = {
    tabId: 7,
    windowId: 1,
    browser: "chrome",
    title: "Handout.pdf",
    url: hint.url,
    activeInWindow: true,
    engagement: { dwellMs: 10000, scrollDepthPct: 0, mediaPlaying: false },
  };
  const work = captureTabs(api, [tab], true, {
    desktop: true,
    captureId: "capture-id",
    tabTimeoutMs: 100,
  });
  await vi.advanceTimersByTimeAsync(101);
  const output = await work;
  expect(output.skipped.some((entry) => /timed out/i.test(entry.reason))).toBe(true);
  expect(h.downloads.cancel).toHaveBeenCalledWith(3);
  expect(h.listeners.size).toBe(0);
  expect(h.downloads.setUiOptions.mock.calls.at(-1)).toEqual([{ enabled: true }]);
});

it("reuses a validated PDF download when the protected viewer rejects injected scripts", async () => {
  const h = harness();
  h.update({ state: "complete" });
  const api = {
    ...h.api,
    scripting: {
      executeScript: vi.fn(async () => {
        throw new Error("Cannot access this page");
      }),
    },
  } as unknown as typeof chrome;
  const tab: CapturedTab = {
    tabId: 7,
    windowId: 1,
    browser: "chrome",
    title: "Handout.pdf",
    url: hint.url,
    activeInWindow: true,
    engagement: { dwellMs: 10000, scrollDepthPct: 0, mediaPlaying: false },
  };
  const pageTime = Date.now() - 60000;
  await captureTabs(api, [tab], true, {
    desktop: true,
    captureId: "capture-id",
    pageOpenedAt: () => pageTime,
  });
  h.downloads.search.mockImplementation(async () => [h.item()]);
  const output = await captureTabs(api, [tab], true, {
    desktop: true,
    captureId: "next-id",
    pageOpenedAt: () => pageTime,
    reusableDownloads: [h.item().filename],
  });
  expect(h.downloads.download).toHaveBeenCalledOnce();
  expect(output.pages[0]?.download?.captureId).toBe("capture-id");
});
