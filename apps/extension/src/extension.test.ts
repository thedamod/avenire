// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { CaptureSnapshot, LibraryFile, PageSnapshot, type CapturedTab } from "@avenire/contracts";
import { decodeFileFrame, FILE_FRAME_BYTES } from "@avenire/capture/frames";
import { extractPage } from "@avenire/capture/extract";
import * as Schema from "effect/Schema";
import { captureTabs, type CaptureOutput } from "./capture.ts";
import { captureOpenTabs, uploadCapture } from "./direct.ts";
import {
  discoverLinks,
  googleExportUrl,
  resolveDocumentUrl,
  selectDocuments,
} from "./documents.ts";
import { fetchDocument, fileFrames, MAX_CAPTURE_BYTES, sha256 } from "./files.ts";
import { chooseAuth, initialPairing, pairingTransition, pairingToken } from "./pairing.ts";
import { matchingTab } from "./reopen.ts";
import { buildTabReport, detectBrowser, permittedTabs } from "./tabs.ts";
import { decodeMessage } from "./wire.ts";
import { restorePosition, selectionQuote } from "./content.ts";

const nativeTab = (
  id = 1,
  url = "https://university.example/lesson",
  extra: Partial<chrome.tabs.Tab> = {},
): chrome.tabs.Tab => ({
  id,
  url,
  windowId: 3,
  index: 0,
  title: "Lesson",
  active: true,
  highlighted: true,
  pinned: false,
  incognito: false,
  selected: true,
  discarded: false,
  frozen: false,
  lastAccessed: 0,
  autoDiscardable: true,
  groupId: -1,
  ...extra,
});
const report = (id = 1, url?: string): CapturedTab =>
  buildTabReport([nativeTab(id, url)], "chrome")[0]!;
const page = (extra: Partial<PageSnapshot> = {}): PageSnapshot =>
  Schema.decodeUnknownSync(PageSnapshot)({
    tabId: 1,
    url: "https://university.example/lesson",
    title: "Lesson",
    description: "Summary",
    language: "en",
    text: "Real page text",
    textLength: 14,
    truncated: false,
    signals: { visibleTextLength: 2000, paywallContainers: [], passwordInput: false },
    ...extra,
  });
const snapshot = (tabs: readonly CapturedTab[]): CaptureSnapshot =>
  Schema.decodeUnknownSync(CaptureSnapshot)({
    id: "capture-1",
    deviceId: "extension-1",
    capturedAt: "2026-10-26T00:00:00.000Z",
    platform: "linux",
    windows: [],
    media: [],
    tabs,
    collectorNotes: [],
  });
const libraryFile = Schema.decodeUnknownSync(LibraryFile)({
  id: "file-1",
  kind: "web-page",
  title: "Lesson",
  placement: "inbox",
  source: "capture",
  tags: [],
  contentModifiedAt: null,
  archivedAt: null,
  sourceUrl: null,
  origin: null,
  access: "open",
  storageKey: null,
  mimeType: null,
  sizeBytes: null,
  captureId: null,
  folderIds: [],
  mediaPositionSec: null,
  preview: null,
  purgeAt: null,
  createdAt: "now",
  updatedAt: "now",
});
const ticket = {
  uploadId: "e5fd78ad-ab47-42eb-aae8-b4b7952674c8",
  uploadUrl: "/api/library/uploads/e5fd78ad-ab47-42eb-aae8-b4b7952674c8",
  expiresAt: "later",
  status: "pending",
};
const secret = "s".repeat(43);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("tab reporting", () => {
  it("excludes private, blocked, unsafe and credential-bearing URLs before reporting", () => {
    const tabs = [
      nativeTab(),
      nativeTab(2, "https://mail.google.com/mail"),
      nativeTab(3, undefined, { incognito: true }),
      nativeTab(4, "chrome://settings"),
      nativeTab(5, "https://user:pass@school.example"),
      nativeTab(6, "https://school.example/checkout"),
    ];
    expect(buildTabReport(tabs, "chrome").map((tab) => tab.tabId)).toEqual([1]);
  });
  it("keeps audible engagement, quoted selection, position and redirect origins", () => {
    const poll = {
      engagement: { dwellMs: 9000, scrollDepthPct: 25, mediaPlaying: false },
      selection: { exact: "selected", prefix: "before", suffix: "after" },
      position: { scrollPct: 25 },
    };
    const result = buildTabReport(
      [nativeTab(1, undefined, { audible: true, pendingUrl: "https://school.example/original" })],
      "edge",
      new Map([[1, poll]]),
    );
    expect(result[0]).toMatchObject({
      url: "https://school.example/original",
      finalUrl: "https://university.example/lesson",
      browser: "edge",
      engagement: { dwellMs: 9000, mediaPlaying: true },
      selection: poll.selection,
      position: poll.position,
    });
  });
  it("blocks a tab when its pending redirect targets a private source", () => {
    expect(
      buildTabReport(
        [nativeTab(1, undefined, { pendingUrl: "https://mail.google.com/mail" })],
        "chrome",
      ),
    ).toEqual([]);
  });
  it("preserves typed access metadata across the shared policy", () => {
    expect(
      permittedTabs([{ ...report(), access: "paywalled", summary: "Abstract" }])[0],
    ).toMatchObject({ access: "paywalled", summary: "Abstract" });
  });
  it("detects brands before the Chromium user agent fallback", () => {
    expect(detectBrowser([{ brand: "Microsoft Edge" }, { brand: "Chromium" }], "Chrome/130")).toBe(
      "edge",
    );
    expect(detectBrowser([{ brand: "Brave" }], "Chrome/130")).toBe("brave");
    expect(detectBrowser([], "Firefox/130")).toBe("firefox");
  });
});

describe("document discovery", () => {
  const discover = (html: string, url = "https://school.example/course") => {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return selectDocuments(discoverLinks(parsed, { location: { href: url } } as Window), url);
  };
  it("finds Moodle attachments and excludes images, navigation and course-index links", () => {
    const found = discover(
      '<main><nav><a href="/privacy.pdf">Privacy</a></nav><a href="/pluginfile.php/1/notes.pdf">Notes.pdf</a><a href="/pluginfile.php/1/notes.pdf">duplicate</a><a href="/pluginfile.php/1/logo.png?forcedownload=1">logo</a><a href="/mod/resource/view.php?id=1">Resource</a></main>',
    );
    expect(found.map((file) => file.url)).toEqual([
      "https://school.example/pluginfile.php/1/notes.pdf",
    ]);
  });
  it("includes download hints, embedded viewers, and Moodle file activity URLs", () => {
    const found = discover(
      '<main><object data="/viewer.html?file=%2Fdeck.pdf"></object><a href="/get?id=2" download>Download</a><a href="/mod/resource/view.php?id=3">Lecture.pdf</a></main>',
    );
    expect(found.map((file) => file.url)).toEqual([
      "https://school.example/deck.pdf",
      "https://school.example/mod/resource/view.php?id=3&redirect=1",
      "https://school.example/get?id=2",
    ]);
  });
  it("supports the Canvas, Moodle and Brightspace adapters", () => {
    expect(discover("<main></main>", "https://school.example/courses/3/files/12")[0]?.url).toBe(
      "https://school.example/courses/3/files/12/download?download_frd=1",
    );
    expect(
      discover("<main></main>", "https://school.example/mod/resource/view.php?id=4")[0]?.url,
    ).toContain("redirect=1");
    expect(
      discover("<main></main>", "https://school.example/d2l/le/content/3/viewContent/4/View")[0]
        ?.url,
    ).toContain("/topics/files/download/4/DirectFileTopicDownload");
  });
  it("caps at ten and survives serialization for script injection", () => {
    document.body.innerHTML = `<main>${Array.from({ length: 20 }, (_, i) => `<a href="/f${i}.pdf">File</a>`).join("")}</main>`;
    const serialized = new Function(
      `return (${discoverLinks.toString()})`,
    )() as typeof discoverLinks;
    expect(
      selectDocuments(
        serialized(document, { location: { href: "https://school.example" } } as Window),
        "https://school.example",
      ),
    ).toHaveLength(10);
  });
  it.each([
    [
      "https://docs.google.com/document/d/abc123/edit",
      "https://docs.google.com/document/d/abc123/export?format=docx",
    ],
    [
      "https://docs.google.com/presentation/d/abc123/edit",
      "https://docs.google.com/presentation/d/abc123/export?format=pdf",
    ],
    [
      "https://docs.google.com/spreadsheets/u/2/d/abc123/edit",
      "https://docs.google.com/spreadsheets/d/abc123/export?format=xlsx&authuser=2",
    ],
    [
      "https://drive.google.com/file/d/abc123/view?authuser=1",
      "https://drive.google.com/uc?export=download&id=abc123&authuser=1",
    ],
  ])("maps Google exports %s", (input, expected) => {
    expect(googleExportUrl(input)).toBe(expected);
  });
  it("unwraps built-in PDF and Office viewers and rejects unsafe schemes", () => {
    expect(
      resolveDocumentUrl(
        "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=https%3A%2F%2Fx.edu%2Fa.pdf",
      ),
    ).toBe("https://x.edu/a.pdf");
    expect(
      resolveDocumentUrl(
        "https://view.officeapps.live.com/op/view.aspx?src=https%3A%2F%2Fx.edu%2Fa.docx",
      ),
    ).toBe("https://x.edu/a.docx");
    expect(resolveDocumentUrl("javascript:alert(1)")).toBeUndefined();
    expect(
      googleExportUrl("https://docs.google.com.evil.example/document/d/abc/edit"),
    ).toBeUndefined();
  });
});

describe("file transfer", () => {
  it("hashes original bytes and frames them in ordered chunks with a final marker", async () => {
    expect(await sha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const bytes = new Uint8Array(FILE_FRAME_BYTES * 2 + 3);
    bytes.fill(19);
    const file = {
      bytes,
      page: page({
        file: {
          url: "https://school.example/a.pdf",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          sha256: await sha256(bytes),
        },
      }),
    };
    const frames = [...fileFrames("request-1", file)].map((frame) => decodeFileFrame(frame)!);
    expect(
      frames.map((frame) => [frame.header.seq, frame.header.final, frame.payload.length]),
    ).toEqual([
      [0, false, FILE_FRAME_BYTES],
      [1, false, FILE_FRAME_BYTES],
      [2, true, 3],
    ]);
    expect(
      frames.every(
        (frame) =>
          frame.header.sha256 === file.page.file!.sha256 && frame.header.requestId === "request-1",
      ),
    ).toBe(true);
  });
  it("fetches with session cookies, rejects HTML and checks final-URL policy before bytes", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response("%PDF-original", {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename=notes.pdf",
          },
        }),
    );
    const result = await fetchDocument(
      { url: "https://school.example/notes.pdf", name: "", rank: 0, explicit: true },
      page(),
      { count: 0, bytes: 0, urls: new Set() },
      new AbortController().signal,
      fetcher,
    );
    expect(result?.page.file?.fileName).toBe("notes.pdf");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
    const htmlFetch = vi.fn(
      async () =>
        new Response("<html>sign in</html>", { headers: { "content-type": "application/pdf" } }),
    );
    await expect(
      fetchDocument(
        { url: "https://school.example/a.pdf", name: "", rank: 0, explicit: true },
        page(),
        { count: 0, bytes: 0, urls: new Set() },
        new AbortController().signal,
        htmlFetch,
      ),
    ).rejects.toThrow("HTML");
  });
  it("enforces the global byte and file caps before large allocations", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response("x", { headers: { "content-length": String(MAX_CAPTURE_BYTES + 1) } }),
    );
    await expect(
      fetchDocument(
        { url: "https://school.example/a.pdf", name: "", rank: 0, explicit: true },
        page(),
        { count: 0, bytes: 0, urls: new Set() },
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow("limit");
    await expect(
      fetchDocument(
        { url: "https://school.example/b.pdf", name: "", rank: 0, explicit: true },
        page(),
        { count: 10, bytes: 0, urls: new Set() },
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow("limit");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("capture boundaries and access", () => {
  const fake = (executeScript: ReturnType<typeof vi.fn>) =>
    ({ scripting: { executeScript } }) as unknown as typeof chrome;
  it("reads nothing when the setting is off or policy excludes the tab", async () => {
    const execute = vi.fn();
    expect((await captureTabs(fake(execute), [report()], false)).pages).toEqual([]);
    expect(
      (await captureTabs(fake(execute), [{ ...report(), url: "https://mail.google.com" }], true))
        .tabs,
    ).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("passes the shared self-contained extractor directly to executeScript", async () => {
    const execute = vi.fn(async (input: { func: unknown }) => [
      { result: input.func === extractPage ? page() : [] },
    ]);
    const output = await captureTabs(fake(execute), [report()], true);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ func: extractPage, args: [1] });
    expect(output.pages[0]?.text).toBe("Real page text");
  });
  it("reports blocked access and summary without sending text, selections, or files", async () => {
    const blocked = page({
      text: "paid teaser",
      signals: { visibleTextLength: 100, paywallContainers: [".paywall"], passwordInput: false },
    });
    const execute = vi.fn(async () => [{ result: blocked }]);
    const output = await captureTabs(
      fake(execute),
      [{ ...report(), selection: { exact: "private selection" } }],
      true,
    );
    expect(output.pages).toEqual([]);
    expect(output.files).toEqual([]);
    expect(output.tabs[0]).toMatchObject({ access: "paywalled", summary: "Summary" });
    expect(JSON.stringify(output)).not.toContain("private selection");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("reapplies policy if the page navigates into a blocked destination", async () => {
    const execute = vi.fn(async () => [{ result: page({ url: "https://mail.google.com/mail" }) }]);
    const output = await captureTabs(fake(execute), [report()], true);
    expect(output.pages).toEqual([]);
    expect(output.skipped[0]?.reason).toContain("permitted");
  });
  it("fetches a browser PDF even when script injection is unavailable", async () => {
    const fetcher = vi.fn(
      async () => new Response("%PDF-bytes", { headers: { "content-type": "application/pdf" } }),
    );
    const output = await captureTabs(
      fake(
        vi.fn(async () => {
          throw new Error("Restricted viewer");
        }),
      ),
      [report(1, "https://school.example/notes.pdf")],
      true,
      { fetcher },
    );
    expect(output.files).toHaveLength(1);
    expect(output.pages[0]?.file?.sizeBytes).toBe(10);
  });
  it("reports session-denied document access without leaking text or files", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    const output = await captureTabs(
      fake(
        vi.fn(async () => {
          throw new Error("Restricted viewer");
        }),
      ),
      [report(1, "https://school.example/notes.pdf")],
      true,
      { fetcher },
    );
    expect(output.tabs[0]?.access).toBe("login-required");
    expect(output.pages).toEqual([]);
    expect(output.files).toEqual([]);
  });
  it("truncates long rendered text to the desktop message byte cap", async () => {
    const long = page({ text: "学".repeat(400_000), textLength: 400_000 });
    const execute = vi.fn(async (input: { func: unknown }) => [
      { result: input.func === extractPage ? long : [] },
    ]);
    const output = await captureTabs(fake(execute), [report()], true);
    expect(output.pages[0]?.truncated).toBe(true);
    expect(output.pages[0]?.text.length).toBeGreaterThan(100_000);
    expect(new TextEncoder().encode(JSON.stringify(output.pages)).byteLength).toBeLessThan(
      1024 * 1024,
    );
  });
  it("bounds concurrency to six and returns on the total deadline", async () => {
    vi.useFakeTimers();
    let active = 0,
      max = 0;
    const execute = vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
      active--;
      return [{ result: page() }];
    });
    const pending = captureTabs(
      fake(execute),
      Array.from({ length: 9 }, (_, i) => report(i + 1)),
      true,
      { tabTimeoutMs: 25, totalTimeoutMs: 40 },
    );
    await vi.advanceTimersByTimeAsync(41);
    const output = await pending;
    // Injection cannot be cancelled, but timed-out slots still attempt the next tab.
    expect(max).toBeLessThanOrEqual(9);
    expect(execute.mock.calls.slice(0, 6)).toHaveLength(6);
    expect(output.pages).toEqual([]);
    expect(output.skipped).toHaveLength(9);
  });
});

describe("direct upload requests", () => {
  it.each([
    [
      "https://drive.google.com/file/d/abc/view",
      "https://drive.google.com/uc?export=download&id=abc",
    ],
    [
      "https://docs.google.com/document/d/abc/edit",
      "https://docs.google.com/document/d/abc/export?format=docx",
    ],
  ])(
    "does not submit an uploaded primary Google document as a URL again: %s",
    async (url, exported) => {
      const bytes = new TextEncoder().encode("original-document");
      const original = page({
        url,
        file: {
          url: exported,
          fileName: "document.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          sizeBytes: bytes.length,
          sha256: await sha256(bytes),
        },
      });
      const output: CaptureOutput = {
        tabs: [report(1, url)],
        pages: [original],
        files: [{ page: original, bytes }],
        skipped: [],
      };
      const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        Response.json(init?.method === "PUT" ? libraryFile : ticket),
      );
      await uploadCapture("https://avenire.example", snapshot(output.tabs), output, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
  it("uploads original PDF bytes with provenance and never substitutes rendered text", async () => {
    const bytes = new TextEncoder().encode("%PDF-original-bytes");
    const original = page({
      url: "https://school.example/notes.pdf",
      text: "",
      textLength: 0,
      file: {
        url: "https://school.example/notes.pdf",
        fileName: "notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: bytes.length,
        sha256: await sha256(bytes),
      },
    });
    const output: CaptureOutput = {
      tabs: [report(1, original.url)],
      pages: [original],
      files: [{ page: original, bytes }],
      skipped: [],
    };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      Response.json(init?.method === "PUT" ? libraryFile : ticket),
    );
    await uploadCapture("https://avenire.example", snapshot(output.tabs), output, fetcher);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
      kind: "pdf",
      mimeType: "application/pdf",
      origin: { url: original.url },
      access: "open",
    });
    expect(fetcher.mock.calls[1]![1]!.body).toEqual(bytes);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("creates a ticket, PUTs bytes, then submits only URL and blocked tabs", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), ...(init ? { init } : {}) });
      return Response.json(
        calls.length === 1 ? ticket : calls.length === 2 ? libraryFile : { files: [], skipped: [] },
      );
    };
    const tabs = [
      report(),
      {
        ...report(2, "https://journal.example/article"),
        access: "paywalled" as const,
        summary: "Abstract",
      },
    ];
    const output: CaptureOutput = { tabs, pages: [page()], files: [], skipped: [] };
    expect(await uploadCapture("https://avenire.example", snapshot(tabs), output, fetcher)).toEqual(
      { saved: 1, skipped: 0 },
    );
    expect(calls.map((call) => [call.init?.method, new URL(call.url).pathname])).toEqual([
      ["POST", "/api/library/uploads"],
      ["PUT", ticket.uploadUrl],
      ["POST", "/api/library/captures"],
    ]);
    const creation = JSON.parse(calls[0]!.init!.body as string);
    expect(creation).toMatchObject({
      kind: "web-page",
      mimeType: "text/markdown",
      access: "open",
      origin: { _tag: "Web", url: tabs[0]!.url },
    });
    expect(JSON.parse(calls[2]!.init!.body as string).snapshot.tabs).toEqual([tabs[1]]);
    expect(calls.every((call) => call.init?.credentials === "include")).toBe(true);
  });
  it("skips PUT for a completed ticket with a decoded existing file", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ...ticket, status: "completed", file: libraryFile }),
    );
    const output: CaptureOutput = { tabs: [report()], pages: [page()], files: [], skipped: [] };
    await uploadCapture("https://avenire.example", snapshot(output.tabs), output, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never uploads bytes to an untrusted ticket destination", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ ...ticket, uploadUrl: "https://evil.example/steal" }),
    );
    const output: CaptureOutput = { tabs: [report()], pages: [page()], files: [], skipped: [] };
    await expect(
      uploadCapture("https://avenire.example", snapshot(output.tabs), output, fetcher),
    ).rejects.toThrow("invalid upload URL");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("submits URL-only captures without uploads", async () => {
    const fetcher = vi.fn(async () => Response.json({ files: [libraryFile], skipped: [] }));
    const output: CaptureOutput = { tabs: [report()], pages: [], files: [], skipped: [] };
    await uploadCapture("https://avenire.example", snapshot(output.tabs), output, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed API responses and reports unauthenticated sessions", async () => {
    const output: CaptureOutput = { tabs: [report()], pages: [], files: [], skipped: [] };
    await expect(
      uploadCapture(
        "https://avenire.example",
        snapshot(output.tabs),
        output,
        vi.fn(async () => Response.json({ files: "bad" })),
      ),
    ).rejects.toThrow();
    await expect(
      uploadCapture(
        "https://avenire.example",
        snapshot(output.tabs),
        output,
        vi.fn(async () => new Response(null, { status: 401 })),
      ),
    ).rejects.toThrow("Not signed in");
  });
});

describe("pairing and protocol", () => {
  const storage = (value: unknown = undefined) =>
    ({
      get: vi.fn(async () => ({ pairingSecret: value })),
      remove: vi.fn(async () => undefined),
    }) as unknown as chrome.storage.StorageArea;
  it("prefers a stored secret, otherwise the signed-in token, or an explicit code", async () => {
    const fetcher = vi.fn(async () => Response.json({ token: secret, readInBrowser: true }));
    expect(
      await chooseAuth(storage(secret), "https://avenire.example", undefined, fetcher),
    ).toEqual({ _tag: "Secret", secret });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await chooseAuth(storage(), "https://avenire.example", undefined, fetcher)).toEqual({
      _tag: "Token",
      token: secret,
    });
    expect(await chooseAuth(storage(secret), "https://avenire.example", "123456", fetcher)).toEqual(
      { _tag: "Code", code: "123456" },
    );
    await expect(
      chooseAuth(storage(), "https://avenire.example", "123", fetcher),
    ).rejects.toThrow();
  });
  it("handles rejection, successful pairing, and disconnect without losing the sign-in state", () => {
    const rejected = pairingTransition(initialPairing, {
      _tag: "Rejected",
      version: 1,
      reason: "unpaired",
    });
    expect(rejected).toMatchObject({ connected: false, needsCode: true });
    const connected = pairingTransition(rejected, { _tag: "Welcome", version: 1, secret });
    expect(connected).toMatchObject({ connected: true, needsCode: false });
    expect(pairingTransition(connected, "disconnect").connected).toBe(false);
    expect(
      pairingTransition(initialPairing, {
        _tag: "Rejected",
        version: 1,
        reason: "account-mismatch",
      }).needsCode,
    ).toBe(false);
  });
  it("does not trust malformed pairing or socket responses", async () => {
    await expect(
      pairingToken(
        "https://avenire.example",
        vi.fn(async () => Response.json({ token: "bad" })),
      ),
    ).rejects.toThrow();
    expect(decodeMessage('{"_tag":"CaptureRequest","version":1,"requestId":"x"}')).toBeUndefined();
    expect(
      decodeMessage(
        JSON.stringify({
          _tag: "CaptureRequest",
          version: 1,
          requestId: "x",
          readInBrowser: false,
        }),
      ),
    ).toMatchObject({ _tag: "CaptureRequest" });
    expect(decodeMessage("{")).toBeUndefined();
    expect(decodeMessage("x".repeat(2_000_000))).toBeUndefined();
  });
});

describe("reopen and content", () => {
  it("matches normalized URLs while excluding private tabs", () => {
    expect(
      matchingTab(
        [
          nativeTab(1, "https://school.example/a?utm_source=x"),
          nativeTab(2, "https://school.example/a?chapter=2"),
        ],
        "https://school.example/a",
      )?.id,
    ).toBe(1);
    expect(
      matchingTab(
        [nativeTab(1, "https://school.example/a", { incognito: true })],
        "https://school.example/a",
      ),
    ).toBeUndefined();
    expect(
      matchingTab(
        [nativeTab(1, "https://school.example/a?chapter=2")],
        "https://school.example/a?chapter=1",
      ),
    ).toBeUndefined();
  });
  it("captures selection as a capped text quote with context", () => {
    document.body.textContent = "prefix " + "x".repeat(600) + " suffix";
    const range = document.createRange();
    range.setStart(document.body.firstChild!, 7);
    range.setEnd(document.body.firstChild!, 607);
    const selected = window.getSelection()!;
    selected.removeAllRanges();
    selected.addRange(range);
    const quote = selectionQuote(selected, document.body);
    expect(quote?.exact).toHaveLength(500);
    expect(quote?.prefix).toBe("prefix ");
    expect(quote?.suffix).toHaveLength(32);
  });
  it("falls back to percentage scroll and restores media time", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    document.body.innerHTML = "<video></video>";
    const media = document.querySelector("video")!;
    Object.defineProperty(media, "readyState", { configurable: true, value: 1 });
    restorePosition({ textQuote: { exact: "missing" }, scrollPct: 50, mediaSec: 42 });
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });
    expect(media.currentTime).toBe(42);
  });
});

describe("v1 capture regressions", () => {
  const ownerUrl = "file:///C:/Users/<user>/Downloads/MATH%20U113%20Course%20Handout.pdf";
  const pdf = () =>
    new Response(new TextEncoder().encode("%PDF-1.7 original bytes"), {
      headers: { "content-type": "application/pdf" },
    });
  const restricted = (allowed = false) =>
    ({
      scripting: {
        executeScript: vi.fn(async () => {
          throw new Error("Cannot access PDF viewer");
        }),
      },
      extension: { isAllowedFileSchemeAccess: vi.fn(async () => allowed) },
    }) as unknown as typeof chrome;

  it("keeps idle, discarded, PDF and file tabs across all normal windows", async () => {
    const tabs = buildTabReport(
      [
        nativeTab(1, "https://school.test/a", { active: false, discarded: true }),
        nativeTab(2, "https://school.test/a.pdf", { active: false, windowId: 4 }),
        nativeTab(3, ownerUrl, { active: false, windowId: 5 }),
        nativeTab(4, ownerUrl, { incognito: true }),
      ],
      "chrome",
    );
    const output = await captureTabs(restricted(), tabs, false, { desktop: true });
    expect(output.tabs.map((tab) => tab.tabId)).toEqual([1, 2, 3]);
    expect(output.tabs[2]?.url).toContain("MATH%20U113");
  });
  it("injects the bundled content script into existing HTTP(S) tabs and tolerates denied hosts", async () => {
    const { injectOpenTabs } = await import("./tabs.ts");
    const executeScript = vi.fn(async () => {
      throw new Error("Restricted host");
    });
    const query = vi.fn(async () => [
      nativeTab(1),
      nativeTab(2, "https://school.test/b"),
      nativeTab(3, ownerUrl),
      nativeTab(4, undefined, { incognito: true }),
    ]);
    await injectOpenTabs({
      tabs: { query },
      scripting: { executeScript },
    } as unknown as typeof chrome);
    expect(query).toHaveBeenCalledWith({ windowType: "normal" });
    expect(executeScript.mock.calls).toEqual([
      [{ target: { tabId: 1 }, files: ["content.js"] }],
      [{ target: { tabId: 2 }, files: ["content.js"] }],
    ]);
  });
  it.each([
    ["https://school.test/lecture.pdf", "https://school.test/lecture.pdf"],
    [
      "chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html?file=https%3A%2F%2Fschool.test%2Flecture.pdf",
      "https://school.test/lecture.pdf",
    ],
    [
      "https://drive.google.com/file/d/drive-file/view",
      "https://drive.google.com/uc?export=download&id=drive-file",
    ],
    [
      "https://docs.google.com/document/d/doc/edit",
      "https://docs.google.com/document/d/doc/export?format=docx",
    ],
    [
      "https://docs.google.com/presentation/d/slides/edit",
      "https://docs.google.com/presentation/d/slides/export?format=pdf",
    ],
    [
      "https://docs.google.com/spreadsheets/d/sheet/edit",
      "https://docs.google.com/spreadsheets/d/sheet/export?format=xlsx",
    ],
  ])("reads original bytes from %s without a content script", async (url, download) => {
    const fetcher = vi.fn(async () => pdf());
    const output = await captureTabs(restricted(), [report(1, url)], true, { fetcher });
    expect(output.files).toHaveLength(1);
    expect(output.files[0]?.page.file?.url).toBe(download);
    expect(fetcher).toHaveBeenCalledWith(
      download,
      expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }),
    );
    expect(output.skipped).toEqual([]);
  });
  it("gives a clear reason when a Drive folder exposes no downloadable files", async () => {
    const url = "https://drive.google.com/drive/u/0/folders/folder-id";
    const api = {
      scripting: {
        executeScript: vi.fn(async (arg: { func: unknown }) => [
          { result: arg.func === extractPage ? page({ url, text: "Folder contents" }) : [] },
        ]),
      },
    } as unknown as typeof chrome;
    const output = await captureTabs(api, [report(1, url)], true);
    expect(output.skipped).toContainEqual({
      tabId: 1,
      reason:
        "No downloadable files were found in this Drive folder. Open a file and capture again.",
    });
  });
  it("reads the owner's file URL with file access, otherwise gives the desktop hint", async () => {
    const fetcher = vi.fn(async () => pdf());
    const denied = await captureTabs(restricted(), [report(1, ownerUrl)], true, { fetcher });
    expect(denied.skipped).toEqual([
      { tabId: 1, reason: "Open Avenire desktop to capture files from this computer" },
    ]);
    expect(fetcher).not.toHaveBeenCalled();
    const allowed = await captureTabs(restricted(true), [report(1, ownerUrl)], true, { fetcher });
    expect(allowed.files).toHaveLength(1);
    expect(allowed.files[0]?.page.file?.fileName).toBe("MATH U113 Course Handout.pdf");
    const requests: Array<{ url: string; body: string }> = [];
    const upload = vi.fn(async (raw: RequestInfo | URL, init?: RequestInit) => {
      const url = String(raw);
      requests.push({ url, body: typeof init?.body === "string" ? init.body : "" });
      return Response.json(
        url.endsWith("/uploads")
          ? { ...ticket, file: libraryFile }
          : { files: [], skipped: [], blocked: [] },
      );
    });
    await uploadCapture("https://avenire.example", snapshot(allowed.tabs), allowed, upload);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.body)).toMatchObject({
      origin: { _tag: "LocalFile", fileName: "MATH U113 Course Handout.pdf" },
    });
    expect(JSON.stringify(requests)).not.toMatch(/file:|C:|Users|Downloads/);
    requests.length = 0;
    await uploadCapture("https://avenire.example", snapshot(denied.tabs), denied, upload);
    expect(requests).toEqual([]);
  });
  it("attempts queued tabs after timeouts and keeps unread URLs on the 20 second deadline", async () => {
    vi.useFakeTimers();
    const api = {
      scripting: { executeScript: vi.fn(() => new Promise(() => {})) },
    } as unknown as typeof chrome;
    const tabs = Array.from({ length: 30 }, (_, i) => ({
      ...report(i + 1, `https://school.test/${i}`),
      activeInWindow: false,
    }));
    const pending = captureTabs(api, tabs, true);
    await vi.advanceTimersByTimeAsync(20_001);
    const result = await pending;
    expect(result.tabs).toHaveLength(30);
    expect(result.pages).toEqual([]);
    expect(result.skipped).toHaveLength(30);
    expect(api.scripting.executeScript).toHaveBeenCalledTimes(30);
    vi.useRealTimers();
  });
});

describe("v1 frame, timing and PDF.js document discovery", () => {
  it("discovers resource timing PDFs, ignores non-documents and deduplicates URLs", () => {
    const doc = new DOMParser().parseFromString(
      '<main><a href="/a.pdf">A.pdf</a></main>',
      "text/html",
    );
    const win = {
      location: { href: "https://school.test/course" },
      performance: {
        getEntriesByType: () => [
          { name: "https://school.test/a.pdf" },
          { name: "https://school.test/xhr/b.docx" },
          { name: "https://school.test/logo.png" },
        ],
      },
    } as unknown as Window;
    expect(
      selectDocuments(discoverLinks(doc, win), win.location.href).map((hint) => hint.url),
    ).toEqual(["https://school.test/a.pdf", "https://school.test/xhr/b.docx"]);
  });
  it("captures a blob-backed PDF.js handout in an iframe with the frame as origin", async () => {
    const { probePdfViewer, readPdfChunk } = await import("./documents.ts");
    const frameUrl = "https://lms.test/viewer.html?id=lecture";
    const bytes = new TextEncoder().encode("%PDF-handout");
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func === extractPage) return [{ frameId: 0, result: page() }];
      if (input.func === discoverLinks) {
        expect(input.target.allFrames).toBe(true);
        return [
          { frameId: 0, result: [] },
          {
            frameId: 7,
            result: [
              {
                url: "https://lms.test/slides.pptx",
                name: "slides.pptx",
                rank: 3,
                explicit: true,
                originUrl: frameUrl,
              },
            ],
          },
        ];
      }
      if (input.func === probePdfViewer) {
        expect(input.target.allFrames).toBe(true);
        expect(input.world).toBe("MAIN");
        return [
          {
            frameId: 7,
            result: {
              url: "blob:https://lms.test/handout",
              frameUrl,
              name: "Handout.pdf",
              memory: true,
            },
          },
        ];
      }
      expect(input.func).toBe(readPdfChunk);
      expect(input.target.frameIds).toEqual([7]);
      expect(input.args[2]).toBe(frameUrl);
      return [
        { frameId: 7, result: { size: bytes.length, data: btoa(String.fromCharCode(...bytes)) } },
      ];
    });
    const fetcher = vi.fn(
      async () =>
        new Response("slides", {
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          },
        }),
    );
    const output = await captureTabs(
      { scripting: { executeScript: execute } } as unknown as typeof chrome,
      [report()],
      true,
      { fetcher },
    );
    expect(output.files).toHaveLength(2);
    expect(output.files[0]?.bytes).toEqual(bytes);
    expect(output.files.map((file) => file.page.file?.originUrl)).toEqual([frameUrl, frameUrl]);
    expect(output.files[0]?.page.file).toMatchObject({
      url: frameUrl,
      fileName: "Handout.pdf",
      mimeType: "application/pdf",
      sha256: await sha256(bytes),
    });
  });
  it("does not read PDF.js bytes from a blocked frame", async () => {
    const { probePdfViewer, readPdfChunk } = await import("./documents.ts");
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func === extractPage) return [{ result: page() }];
      if (input.func === probePdfViewer)
        return [
          {
            frameId: 7,
            result: {
              url: "blob:https://mail.google.com/x",
              frameUrl: "https://mail.google.com/inbox",
              name: "Private.pdf",
              memory: true,
            },
          },
        ];
      if (input.func === readPdfChunk) throw new Error("must not read");
      return [{ result: [] }];
    });
    const output = await captureTabs(
      { scripting: { executeScript: execute } } as unknown as typeof chrome,
      [report()],
      true,
    );
    expect(output.files).toEqual([]);
    expect(execute.mock.calls.some(([input]) => input.func === readPdfChunk)).toBe(false);
  });
  it("caps memory PDFs at ten files and rejects oversized PDF.js data", async () => {
    const { probePdfViewer, readPdfChunk } = await import("./documents.ts");
    let oversized = true;
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func === extractPage) return [{ result: page() }];
      if (input.func === probePdfViewer)
        return Array.from({ length: 12 }, (_, frameId) => ({
          frameId,
          result: {
            url: "blob:https://school.test/x",
            frameUrl: `https://school.test/viewer/${frameId}`,
            name: "Handout.pdf",
            memory: true,
          },
        }));
      if (input.func === readPdfChunk)
        return [{ result: { size: oversized ? MAX_CAPTURE_BYTES + 1 : 6, data: btoa("%PDF-x") } }];
      return [{ result: [] }];
    });
    const api = { scripting: { executeScript: execute } } as unknown as typeof chrome;
    expect((await captureTabs(api, [report()], true)).files).toHaveLength(0);
    expect(execute.mock.calls.filter(([input]) => input.func === readPdfChunk)).toHaveLength(10);
    oversized = false;
    expect((await captureTabs(api, [report()], true)).files).toHaveLength(10);
  });
  it("keeps other discovery stages when all-frame DOM injection fails", async () => {
    const { probePdfViewer } = await import("./documents.ts");
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func === extractPage) return [{ result: page() }];
      if (input.func === discoverLinks) throw new Error("frame inaccessible");
      if (input.func === probePdfViewer)
        return [
          {
            frameId: 3,
            result: {
              url: "https://school.test/handout.pdf",
              frameUrl: "https://school.test/viewer",
              name: "Handout.pdf",
              memory: false,
            },
          },
        ];
      return [];
    });
    const fetcher = vi.fn(
      async () => new Response("%PDF-handout", { headers: { "content-type": "application/pdf" } }),
    );
    const output = await captureTabs(
      { scripting: { executeScript: execute } } as unknown as typeof chrome,
      [report()],
      true,
      { fetcher },
    );
    expect(output.files).toHaveLength(1);
    expect(output.files[0]?.page.file?.originUrl).toBe("https://school.test/viewer");
  });
  it("probes PDF.js URL and memory variants using a self-contained function", async () => {
    const { probePdfViewer } = await import("./documents.ts");
    const probe = new Function(`return (${probePdfViewer.toString()})`)() as typeof probePdfViewer;
    const win = (app: unknown) =>
      ({
        location: { href: "https://school.test/viewer" },
        document: { title: "Lecture" },
        PDFViewerApplication: app,
      }) as unknown as Window;
    expect(probe(win({ url: "https://school.test/a.pdf" }))).toMatchObject({
      memory: false,
      url: "https://school.test/a.pdf",
    });
    for (const url of ["blob:https://school.test/x", "data:application/pdf;base64,eA==", ""])
      expect(probe(win({ url, pdfDocument: { getData: vi.fn() } }))).toMatchObject({
        memory: true,
      });
    expect(probe(win({ url: "blob:https://school.test/x" }))).toBeNull();
  });
});

it("includes socket transfer and backpressure in the remaining capture deadline", async () => {
  const { sendFileFrames } = await import("./files.ts");
  vi.useFakeTimers();
  try {
    const bytes = new TextEncoder().encode("%PDF-x");
    const file = {
      bytes,
      page: page({
        file: {
          url: "https://school.test/a.pdf",
          fileName: "a.pdf",
          mimeType: "application/pdf",
          sizeBytes: bytes.length,
          sha256: "a".repeat(64),
        },
      }),
    };
    const socket = { readyState: 1 as const, bufferedAmount: 3 * 1024 * 1024, send: vi.fn() };
    const work = sendFileFrames("request", [file], socket, Date.now() + 25, () => true);
    await vi.advanceTimersByTimeAsync(25);
    await work;
    expect(socket.send).not.toHaveBeenCalled();
    socket.bufferedAmount = 0;
    await sendFileFrames("request", [file], socket, Date.now() + 100, () => true);
    expect(socket.send).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps top-level linked originals at their own URL and embedded discoveries at their frame URL", () => {
  const doc = new DOMParser().parseFromString(
    '<main><a href="/notes.pdf">Notes.pdf</a><iframe src="about:blank"></iframe></main>',
    "text/html",
  );
  // Give discovery a frame URL without making happy-dom perform a network load.
  vi.spyOn(doc.querySelector("iframe")!, "getAttribute").mockImplementation((name) =>
    name === "src" ? "/viewer.html?file=notes.pdf" : null,
  );
  const top = { location: { href: "https://school.test/course" } } as unknown as Window;
  Object.defineProperty(top, "top", { value: top });
  const main = discoverLinks(doc, top);
  expect(main.find((hint) => hint.url.endsWith("/notes.pdf"))?.originUrl).toBeUndefined();
  expect(main.find((hint) => hint.url.includes("viewer.html"))?.originUrl).toBe(
    "https://school.test/viewer.html?file=notes.pdf",
  );
  const frame = { location: { href: "https://school.test/frame" }, top } as unknown as Window;
  expect(discoverLinks(doc, frame).find((hint) => hint.url.endsWith("/notes.pdf"))?.originUrl).toBe(
    "https://school.test/frame",
  );
});

describe("all-tabs streaming regression", () => {
  it("attempts 30 slow tabs, uploads ten primary PDF/Drive documents and saves before reading finishes in direct mode", async () => {
    vi.useFakeTimers();
    // WebCrypto runs outside the fake clock; keep hashing deterministic in this scheduler test.
    vi.spyOn(crypto.subtle, "digest").mockResolvedValue(new Uint8Array(32).buffer);
    const tabs = Array.from({ length: 30 }, (_, i) =>
      report(
        i + 1,
        i < 5
          ? `https://school.test/${i}.pdf`
          : i < 10
            ? `https://drive.google.com/file/d/file${i}/view`
            : `https://school.test/page${i}`,
      ),
    );
    const attempted: number[] = [];
    let reading = 0,
      max = 0,
      uploaded = 0,
      firstSavedAfterAttempts = 0;
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func !== extractPage) return [];
      attempted.push(input.target.tabId);
      reading++;
      max = Math.max(max, reading);
      await new Promise((done) => setTimeout(done, 1800));
      reading--;
      const tab = tabs.find((tab) => tab.tabId === input.target.tabId)!;
      return [
        {
          result: page({
            tabId: tab.tabId,
            url: tab.url,
            text: tab.tabId <= 10 ? "" : "Readable content",
          }),
        },
      ];
    });
    const uploadInputs: any[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (!String(url).startsWith("https://avenire.example")) {
        await new Promise((done) => setTimeout(done, 500));
        return new Response("%PDF-original", { headers: { "content-type": "application/pdf" } });
      }
      if (String(url).endsWith("/uploads")) {
        uploadInputs.push(JSON.parse(String(init?.body)));
        uploaded++;
        if (uploaded === 1) firstSavedAfterAttempts = attempted.length;
        return Response.json({
          ...ticket,
          status: "completed",
          file: libraryFile,
        });
      }
      throw new Error(`Unexpected anonymous fallback: ${url}`);
    });
    const pending = captureOpenTabs(
      { scripting: { executeScript: execute } } as unknown as typeof chrome,
      tabs,
      true,
      "https://avenire.example",
      snapshot(tabs),
      fetcher,
    );
    await vi.advanceTimersByTimeAsync(20_001);
    const result = await pending;
    expect(new Set(attempted).size).toBe(30);
    expect(max).toBe(6);
    expect(uploadInputs.filter((input) => input.kind === "pdf")).toHaveLength(10);
    expect(result.saved).toBe(30);
    expect(firstSavedAfterAttempts).toBeLessThan(30);
  });

  it("uploads a tab's own document plus ten of its fifteen discovered links", async () => {
    const url = "https://school.test/original.pdf";
    const execute = vi.fn(async (input: any): Promise<any[]> => {
      if (input.func === extractPage) return [{ result: page({ url, text: "" }) }];
      if (input.func === discoverLinks)
        return [
          {
            result: Array.from({ length: 15 }, (_, i) => ({
              url: `https://school.test/link${i}.pdf`,
              name: "",
              rank: 3,
              explicit: true,
            })),
          },
        ];
      return [];
    });
    const output = await captureTabs(
      { scripting: { executeScript: execute } } as unknown as typeof chrome,
      [report(1, url)],
      true,
      {
        fetcher: async () =>
          new Response("%PDF-original", { headers: { "content-type": "application/pdf" } }),
      },
    );
    expect(output.files).toHaveLength(11);
    expect(output.files.filter((file) => file.page.file?.primary)).toHaveLength(1);
  });

  it("never submits unread Drive or Docs tabs to anonymous capture", async () => {
    const tabs = [
      report(1, "https://drive.google.com/file/d/abc/view"),
      report(2, "https://docs.google.com/document/d/abc/edit"),
    ];
    const fetcher = vi.fn();
    const result = await uploadCapture(
      "https://avenire.example",
      snapshot(tabs),
      {
        tabs,
        pages: [],
        files: [],
        skipped: tabs.map((tab) => ({ tabId: tab.tabId, reason: "Read in browser timed out" })),
      },
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toEqual({ saved: 0, skipped: 2 });
  });
});

it("uses the per-file contract limit even below 1 GiB and redacts private network errors", async () => {
  const { MAX_SOURCE_UPLOAD_BYTES } = await import("@avenire/contracts");
  const fetcher = vi.fn(
    async () =>
      new Response("x", {
        headers: {
          "content-length": String(MAX_SOURCE_UPLOAD_BYTES + 1),
          "content-type": "application/pdf",
        },
      }),
  );
  const api = {
    scripting: {
      executeScript: vi.fn(async () => {
        throw new Error("Cannot inject");
      }),
    },
  } as unknown as typeof chrome;
  const oversized = await captureTabs(api, [report(1, "https://school.test/a.pdf")], true, {
    fetcher,
  });
  expect(oversized.files).toHaveLength(0);
  expect(oversized.skipped).toContainEqual({ tabId: 1, reason: "Capture file limit exceeded" });
  const unread = await captureTabs(api, [report(1, "https://school.test/a.pdf")], true, {
    fetcher: async () => {
      throw new Error("C:\\Users\\student\\private.pdf?token=secret");
    },
  });
  expect(JSON.stringify(unread.skipped)).not.toMatch(/student|private|secret/);
});

it("shows a Needs you reason for unread Drive tabs in direct mode", async () => {
  vi.useFakeTimers();
  const tabs = [report(1, "https://drive.google.com/file/d/abc/view")];
  const fetcher = vi.fn();
  const pending = captureOpenTabs(
    { scripting: { executeScript: () => new Promise(() => {}) } } as unknown as typeof chrome,
    tabs,
    true,
    "https://avenire.example",
    snapshot(tabs),
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(6001);
  expect(await pending).toEqual({
    saved: 0,
    skipped: 1,
    note: "Saved 0 source(s). Needs you · open in browser and capture again. Read in browser timed out",
  });
  expect(fetcher).not.toHaveBeenCalled();
});
