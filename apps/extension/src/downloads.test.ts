import { afterEach, expect, it, vi } from "vite-plus/test";
import { downloadDocument, hideCaptureDownloads } from "./downloads.ts";
import { captureTabs } from "./capture.ts";
import { extractPage } from "@avenire/capture/extract";
import { discoverLinks } from "./documents.ts";
import type { PageSnapshot, CapturedTab } from "@avenire/contracts";
import { MAX_SOURCE_UPLOAD_BYTES } from "@avenire/contracts";
import { driveReasons, downloadInterruptedReason } from "./document-response.ts";
import { fetchDocument } from "./files.ts";
import { googleExportUrl } from "./documents.ts";

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
    download: vi.fn(async (_options: chrome.downloads.DownloadOptions) => item.id),
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
    "The browser couldn't save the downloaded file. Check file access and free disk space, then capture again.",
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
    reason:
      "The download stopped because of a network problem. Check your connection and capture again.",
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

const driveTab: CapturedTab = {
  tabId: 7,
  windowId: 1,
  browser: "chrome",
  title: "Large textbook.pdf - Google Drive",
  url: "https://drive.google.com/file/d/textbook/view?authuser=1&resourcekey=share-key",
  activeInWindow: true,
  engagement: { dwellMs: 10000, scrollDepthPct: 0, mediaPlaying: false },
};
const driveUrl = googleExportUrl(driveTab.url)!;
const driveHint = { ...hint, url: driveUrl };
const htmlResponse = (html: string, status = 200) =>
  new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
const pdfResponse = () =>
  new Response("%PDF-original", { headers: { "content-type": "application/pdf" } });
const virusForm = `<!doctype html><html><body>Google Drive can't scan this file for viruses.
  <form action="https://drive.usercontent.google.com/download?export=download&amp;authuser=0" id="download-form" method="get">
    <input value="textbook" name="id" type="hidden">
    <input type='hidden' name='confirm' value='token&amp;confirmed'>
    <input type=hidden name=uuid value=large-file-uuid>
  </form></body></html>`;
const driveApi = (h: ReturnType<typeof harness>) =>
  ({
    ...h.api,
    scripting: { executeScript: vi.fn(async () => []) },
  }) as unknown as typeof chrome;

it.each([
  [
    "quota",
    "<html><body>Too many users have viewed or downloaded this file recently.</body></html>",
    403,
    driveReasons.quota,
  ],
  ["download quota", "<html><body>Download quota exceeded</body></html>", 200, driveReasons.quota],
  [
    "owner-disabled",
    "<html><body>The owner has disabled downloading for this file.</body></html>",
    403,
    driveReasons.disabled,
  ],
  [
    "unknown refusal",
    "<html><body>Something went wrong</body></html>",
    403,
    "Google Drive didn't return the file (HTTP 403).",
  ],
  [
    "wrong account",
    "<html><body>You need access. Switch accounts.</body></html>",
    403,
    driveReasons.login,
  ],
])(
  "reports Drive %s honestly without a login access state",
  async (_name, html, status, reason) => {
    const h = harness();
    const fetcher = vi.fn(async () => htmlResponse(html as string, status as number));
    const output = await captureTabs(driveApi(h), [driveTab], true, {
      desktop: true,
      captureId: "capture-id",
      fetcher,
    });
    expect(output.skipped).toEqual([{ tabId: 7, reason }]);
    expect(output.tabs[0]?.access).toBe("open");
    expect(output.pages).toEqual([]);
    expect(h.downloads.download).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce(); // Do not invent a Drive preview-original endpoint.
  },
);

it("marks only a real ServiceLogin redirect as login-required and keeps its sentence", async () => {
  const h = harness();
  const fetcher = vi.fn(async () => {
    const response = htmlResponse("<html>Sign in</html>");
    Object.defineProperty(response, "url", {
      value: "https://accounts.google.com/ServiceLogin?continue=drive",
    });
    return response;
  });
  const output = await captureTabs(driveApi(h), [driveTab], true, {
    desktop: true,
    captureId: "capture-id",
    fetcher,
  });
  expect(output.tabs[0]?.access).toBe("login-required");
  expect(output.skipped).toEqual([{ tabId: 7, reason: driveReasons.login }]);
  expect(h.downloads.download).not.toHaveBeenCalled();
});

it("carries authuser/resourcekey and follows a large-file form once before Chrome downloads", async () => {
  const h = harness();
  h.update({ state: "complete", url: driveUrl, finalUrl: driveUrl });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(htmlResponse(virusForm))
    .mockResolvedValueOnce(pdfResponse());
  const output = await downloadDocument(
    h.api,
    driveHint,
    { ...page, url: driveTab.url },
    budget(),
    new AbortController().signal,
    "capture-id",
    0,
    [],
    () => true,
    { fetcher },
  );
  expect(fetcher.mock.calls[0]).toEqual([
    driveUrl,
    expect.objectContaining({ credentials: "include" }),
  ]);
  const confirmed = new URL(fetcher.mock.calls[1]![0]);
  expect(Object.fromEntries(confirmed.searchParams)).toMatchObject({
    id: "textbook",
    export: "download",
    authuser: "1",
    resourcekey: "share-key",
    confirm: "token&confirmed",
    uuid: "large-file-uuid",
  });
  expect(h.downloads.download.mock.calls[0]?.[0]).toMatchObject({ url: confirmed.href });
  expect(output?.download?.url).toBe(driveUrl); // Confirmation tokens stay in the worker.
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("direct capture uses the same confirmed Drive response without a third request", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(htmlResponse(virusForm))
    .mockResolvedValueOnce(pdfResponse());
  const file = await fetchDocument(
    driveHint,
    page,
    budget(),
    new AbortController().signal,
    fetcher,
  );
  expect(new TextDecoder().decode(file?.bytes)).toBe("%PDF-original");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  ["repeated warning", virusForm],
  [
    "untrusted action",
    virusForm.replace(
      "https://drive.usercontent.google.com/download",
      "https://evil.test/download",
    ),
  ],
  ["other file", virusForm.replace('value="textbook"', 'value="other-file"')],
])("does not loop or send confirmation tokens to %s", async (_name, html) => {
  const h = harness();
  const fetcher = vi.fn(async () => htmlResponse(html));
  await expect(
    downloadDocument(
      h.api,
      driveHint,
      page,
      budget(),
      new AbortController().signal,
      "capture-id",
      0,
      [],
      () => true,
      { fetcher },
    ),
  ).rejects.toThrow(driveReasons.confirm);
  expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
  expect(h.downloads.download).not.toHaveBeenCalled();
});

it("detects HTML quota even when Drive labels it application/pdf", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response("<html>Download quota exceeded</html>", {
        headers: { "content-type": "application/pdf" },
      }),
  );
  await expect(
    fetchDocument(driveHint, page, budget(), new AbortController().signal, fetcher),
  ).rejects.toThrow(driveReasons.quota);
});

it("probes a successful Drive download without buffering its body", async () => {
  const h = harness();
  h.update({ state: "complete" });
  const cancel = vi.fn();
  const fetcher = vi.fn(
    async (_url: RequestInfo | URL) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("%PDF-"));
          },
          cancel,
        }),
        { headers: { "content-type": "application/pdf" } },
      ),
  );
  await downloadDocument(
    h.api,
    driveHint,
    page,
    budget(),
    new AbortController().signal,
    "capture-id",
    0,
    [],
    () => true,
    { fetcher },
  );
  expect(fetcher.mock.calls[0]?.[0]).toBe(driveUrl);
  expect(cancel).toHaveBeenCalledOnce();
  expect(h.downloads.download.mock.calls[0]?.[0]).toMatchObject({ url: driveUrl });
});

it("diagnoses a Drive refusal that starts after the successful probe", async () => {
  const h = harness();
  h.update({ state: "interrupted", error: "SERVER_FORBIDDEN" });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(pdfResponse())
    .mockResolvedValueOnce(htmlResponse("<html>Download quota exceeded</html>", 403));
  await expect(
    downloadDocument(
      h.api,
      driveHint,
      page,
      budget(),
      new AbortController().signal,
      "capture-id",
      0,
      [],
      () => true,
      { fetcher },
    ),
  ).rejects.toThrow(driveReasons.quota);
  expect(h.downloads.download).toHaveBeenCalledOnce();
});

it("reports non-Drive HTML instead of guessing login-required", async () => {
  const h = harness();
  h.update({ state: "complete", mime: "text/html" });
  const fetcher = vi.fn(async () => htmlResponse("<html><form>Sign in</form></html>"));
  const output = await captureTabs(driveApi(h), [{ ...driveTab, url: hint.url }], true, {
    desktop: true,
    captureId: "capture-id",
    fetcher,
  });
  expect(output.skipped).toEqual([
    {
      tabId: 7,
      reason:
        "The site returned a web page instead of the file (you may need to sign in on school.test)",
    },
  ]);
  expect(output.tabs[0]?.access).toBe("open");
});

it.each([
  "SERVER_FORBIDDEN",
  "SERVER_UNAUTHORIZED",
  "NETWORK_FAILED",
  "NETWORK_TIMEOUT",
  "FILE_TOO_LARGE",
  "USER_CANCELED",
])("maps interruption %s to a plain sentence without an access label", async (error) => {
  const h = harness();
  h.update({ state: "interrupted", error });
  await expect(
    downloadDocument(
      h.api,
      hint,
      page,
      budget(),
      new AbortController().signal,
      "capture-id",
      0,
      [],
      () => true,
      { fetcher: vi.fn(async () => pdfResponse()) },
    ),
  ).rejects.toThrow(downloadInterruptedReason(error));
  expect(downloadInterruptedReason(error)).not.toContain(error);
});

it("keeps a 256 MiB download alive past six seconds using polled bytes, reports progress, and removes timers", async () => {
  vi.useFakeTimers();
  const h = harness();
  h.update({
    bytesReceived: 0,
    totalBytes: MAX_SOURCE_UPLOAD_BYTES,
    fileSize: MAX_SOURCE_UPLOAD_BYTES,
  });
  const progress = vi.fn();
  const work = captureTabs(driveApi(h), [driveTab], true, {
    desktop: true,
    captureId: "capture-id",
    totalTimeoutMs: 20_000,
    onProgress: progress,
    fetcher: vi.fn(async () => pdfResponse()),
  });
  for (let i = 1; i <= 8; i++) {
    await vi.advanceTimersByTimeAsync(1000);
    // Chrome does NOT fire onChanged for bytesReceived; only search polling can see these.
    h.item().bytesReceived = i * 20 * 1024 * 1024;
    await vi.advanceTimersByTimeAsync(250);
  }
  expect(h.downloads.cancel).not.toHaveBeenCalled();
  h.update({ state: "complete", bytesReceived: MAX_SOURCE_UPLOAD_BYTES });
  const output = await work;
  expect(output.pages[0]?.download?.sizeBytes).toBe(MAX_SOURCE_UPLOAD_BYTES);
  expect(output.skipped).toEqual([]);
  expect(progress).toHaveBeenCalled();
  expect(h.listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("handles uc-download-link confirmation using the original account and resource key", async () => {
  const h = harness();
  h.update({ state: "complete" });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      htmlResponse(
        `<html><a id="uc-download-link" href="https://drive.google.com/uc?id=textbook&amp;export=download&amp;confirm=confirm-token">Download anyway</a></html>`,
      ),
    )
    .mockResolvedValueOnce(pdfResponse());
  await downloadDocument(
    h.api,
    driveHint,
    page,
    budget(),
    new AbortController().signal,
    "capture-id",
    0,
    [],
    () => true,
    { fetcher },
  );
  const confirmed = new URL(fetcher.mock.calls[1]![0]);
  expect(confirmed.hostname).toBe("drive.usercontent.google.com");
  expect(Object.fromEntries(confirmed.searchParams)).toMatchObject({
    id: "textbook",
    authuser: "1",
    resourcekey: "share-key",
    confirm: "confirm-token",
  });
});

it.each(["NETWORK_FAILED", "USER_CANCELED"])(
  "does not delay Drive %s with another network request",
  async (error) => {
    const h = harness();
    h.update({ state: "interrupted", error });
    const fetcher = vi.fn(async () => pdfResponse());
    await expect(
      downloadDocument(
        h.api,
        driveHint,
        page,
        budget(),
        new AbortController().signal,
        "capture-id",
        0,
        [],
        () => true,
        { fetcher },
      ),
    ).rejects.toThrow(downloadInterruptedReason(error));
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it("cuts off a previously progressing download once it stalls", async () => {
  vi.useFakeTimers();
  const h = harness();
  const work = captureTabs(driveApi(h), [{ ...driveTab, url: hint.url }], true, {
    desktop: true,
    captureId: "capture-id",
    tabTimeoutMs: 1000,
    totalTimeoutMs: 10000,
  });
  await vi.advanceTimersByTimeAsync(500);
  h.item().bytesReceived = 100;
  await vi.advanceTimersByTimeAsync(250);
  await vi.advanceTimersByTimeAsync(1001);
  const output = await work;
  expect(output.pages).toEqual([]);
  expect(output.skipped.some((entry) => /timed out/i.test(entry.reason))).toBe(true);
  expect(h.downloads.cancel).toHaveBeenCalledWith(3);
  expect(h.listeners.size).toBe(0);
});

it("never extends an active download beyond the total capture budget", async () => {
  vi.useFakeTimers();
  const h = harness();
  const work = captureTabs(driveApi(h), [{ ...driveTab, url: hint.url }], true, {
    desktop: true,
    captureId: "capture-id",
    tabTimeoutMs: 1000,
    totalTimeoutMs: 2500,
  });
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(400);
    h.item().bytesReceived = (i + 1) * 100;
  }
  await vi.advanceTimersByTimeAsync(501);
  const output = await work;
  expect(output.pages).toEqual([]);
  expect(h.downloads.cancel).toHaveBeenCalledWith(3);
  expect(vi.getTimerCount()).toBe(0);
});
