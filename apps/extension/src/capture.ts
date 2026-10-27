import { CapturedTab, PageSnapshot, type ExtensionMessage } from "@avenire/contracts";
import { extractPage } from "@avenire/capture/extract";
import { classifyAccess } from "@avenire/capture/access";
import { isEngaged } from "@avenire/capture/candidates";
import { normalizeUrl } from "@avenire/capture/url";
import * as Schema from "effect/Schema";
import {
  discoverLinks,
  resolveDocumentUrl,
  selectDocuments,
  probePdfViewer,
  readPdfChunk,
} from "./documents.ts";
import {
  DocumentAccessError,
  fetchDocument,
  MAX_CAPTURE_BYTES,
  safeFileName,
  sha256,
  type CapturedFile,
  type FileBudget,
} from "./files.ts";
import { permittedTabs, publicTab } from "./tabs.ts";
import { MAX_MESSAGE_BYTES, within } from "./wire.ts";

export interface CaptureOutput {
  readonly tabs: readonly CapturedTab[];
  readonly pages: readonly PageSnapshot[];
  readonly files: readonly CapturedFile[];
  readonly skipped: readonly { readonly tabId: number; readonly reason: string }[];
}

const emptyPage = (tab: CapturedTab): PageSnapshot => ({
  tabId: tab.tabId,
  url: tab.finalUrl ?? tab.url,
  title: tab.title,
  description: "",
  language: "",
  text: "",
  textLength: 0,
  truncated: false,
  signals: { visibleTextLength: 0, paywallContainers: [], passwordInput: false },
});

export function safePage(page: PageSnapshot): PageSnapshot {
  return {
    ...page,
    url: normalizeUrl(page.url),
    ...(page.canonicalUrl ? { canonicalUrl: normalizeUrl(page.canonicalUrl) } : {}),
    ...(page.file
      ? {
          file: {
            ...page.file,
            url: normalizeUrl(page.file.url),
            ...(page.file.originUrl ? { originUrl: normalizeUrl(page.file.originUrl) } : {}),
          },
        }
      : {}),
  };
}

export async function captureTabs(
  api: typeof chrome,
  input: readonly CapturedTab[],
  readInBrowser: boolean,
  options: {
    readonly tabTimeoutMs?: number;
    readonly totalTimeoutMs?: number;
    readonly fetcher?: typeof fetch;
    /** Desktop reads local files itself and records their private paths. */
    readonly desktop?: boolean;
  } = {},
): Promise<CaptureOutput> {
  const tabs = permittedTabs(input).sort(
    (a, b) =>
      Number(!!b.selection) - Number(!!a.selection) ||
      Number(b.activeInWindow) - Number(a.activeInWindow) ||
      Number(isEngaged(b)) - Number(isEngaged(a)),
  );
  if (
    !readInBrowser &&
    (options.desktop || !tabs.some((tab) => /^file:/i.test(tab.finalUrl ?? tab.url)))
  )
    return { tabs: tabs.map(publicTab), pages: [], files: [], skipped: [] };
  const deadline = Date.now() + (options.totalTimeoutMs ?? 8000);
  const pages: PageSnapshot[] = [];
  const files: CapturedFile[] = [];
  const skipped: { tabId: number; reason: string }[] = [];
  const updated = new Map(tabs.map((tab) => [tab.tabId, tab]));
  const budget: FileBudget = { count: 0, bytes: 0, urls: new Set() };
  let next = 0;
  let messageBytes = 1024;
  const accept = (page: PageSnapshot, file?: CapturedFile) => {
    let clean = safePage(page);
    const measure = (value: PageSnapshot): number =>
      new TextEncoder().encode(JSON.stringify(value)).byteLength + 2;
    let size = measure(clean);
    const available = MAX_MESSAGE_BYTES - 128_000 - messageBytes;
    if (size > available && !file) {
      // Fit visible text to the JSON byte budget, including UTF-8 and JSON escaping.
      let low = 0,
        high = clean.text.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (
          measure({
            ...clean,
            text: clean.text.slice(0, middle),
            textLength: middle,
            truncated: true,
          }) <= available
        )
          low = middle;
        else high = middle - 1;
      }
      let text = clean.text.slice(0, low);
      if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
      clean = { ...clean, text, textLength: text.length, truncated: true };
      size = measure(clean);
    }
    if (pages.length >= 200 || messageBytes + size > MAX_MESSAGE_BYTES - 128_000) {
      skipped.push({ tabId: page.tabId, reason: "Capture response size limit reached" });
      return;
    }
    messageBytes += size;
    pages.push(clean);
    if (file) files.push({ ...file, page: clean });
  };
  const worker = async () => {
    while (next < tabs.length) {
      const tab = tabs[next++]!;
      const remaining = Math.min(options.tabTimeoutMs ?? 2500, deadline - Date.now());
      if (remaining <= 0) {
        skipped.push({ tabId: tab.tabId, reason: "Capture timed out" });
        continue;
      }
      const controller = new AbortController();
      const tabDeadline = Date.now() + remaining;
      const timer = setTimeout(() => controller.abort(), remaining);
      const read = async () => {
        const local = (tab.finalUrl ?? tab.url).startsWith("file:");
        if ((!local && !readInBrowser) || (local && options.desktop)) return;
        if (local && !(await api.extension.isAllowedFileSchemeAccess()))
          throw new Error("Open Avenire desktop to capture files from this computer");
        let page: PageSnapshot;
        try {
          const extracted = await api.scripting.executeScript({
            target: { tabId: tab.tabId },
            func: extractPage,
            args: [tab.tabId],
          });
          page = Schema.decodeUnknownSync(PageSnapshot)(extracted[0]?.result);
        } catch {
          if (!resolveDocumentUrl(tab.finalUrl ?? tab.url))
            throw new Error("Page content unavailable");
          page = emptyPage(tab); // Browser PDF viewers cannot run scripts; fetch the original URL.
        }
        if (controller.signal.aborted) return;
        const current: CapturedTab = {
          ...tab,
          url: page.url,
          finalUrl: page.url,
          title: page.title,
        };
        if (!permittedTabs([current]).length || page.tabId !== tab.tabId)
          throw new Error("Page no longer permitted");
        const access = classifyAccess(page.signals);
        const summary = (page.abstract || page.description).slice(0, 10000);
        updated.set(tab.tabId, {
          ...tab,
          finalUrl: page.url,
          access,
          summary,
          ...(access === "open" ? {} : { selection: undefined, position: undefined }),
        });
        if (access !== "open") {
          // Only the tab's typed access and abstract leave the browser; no blocked text or files.
          skipped.push({ tabId: tab.tabId, reason: access });
          return;
        }
        if (page.text.trim()) accept(page);
        let hints: ReturnType<typeof discoverLinks> = [];
        try {
          const found = await api.scripting.executeScript({
            target: { tabId: tab.tabId, allFrames: true },
            func: discoverLinks,
          });
          hints = found.flatMap((frame) => frame.result ?? []);
        } catch {
          /* A built-in PDF viewer still has its tab URL. */
        }
        if (controller.signal.aborted) return;
        // Probe every frame before fetching: an LMS shell may hold a blob-backed PDF.js viewer.
        try {
          const viewers = await api.scripting.executeScript({
            target: { tabId: tab.tabId, allFrames: true },
            world: "MAIN",
            func: probePdfViewer,
          });
          for (const frame of viewers) {
            if (controller.signal.aborted || budget.count >= 10) break;
            const viewer = frame.result;
            if (
              !viewer ||
              !/^https?:/i.test(viewer.frameUrl) ||
              !permittedTabs([{ ...current, url: viewer.frameUrl, finalUrl: viewer.frameUrl }])
                .length
            )
              continue;
            if (!viewer.memory) {
              hints.push({
                url: viewer.url,
                name: viewer.name,
                rank: 0,
                explicit: true,
                originUrl: viewer.frameUrl,
              });
              continue;
            }
            const key = `pdfjs:${tab.tabId}:${frame.frameId}:${viewer.frameUrl}`;
            if (budget.urls.has(key)) continue;
            budget.urls.add(key);
            budget.count++;
            try {
              let bytes: Uint8Array<ArrayBuffer> | undefined;
              let offset = 0;
              const available = MAX_CAPTURE_BYTES - budget.bytes;
              do {
                const chunks = await api.scripting.executeScript({
                  target: { tabId: tab.tabId, frameIds: [frame.frameId] },
                  world: "MAIN",
                  func: readPdfChunk,
                  args: [offset, available, viewer.frameUrl],
                });
                if (controller.signal.aborted) break;
                const chunk = chunks[0]?.result;
                if (
                  !chunk ||
                  !Number.isSafeInteger(chunk.size) ||
                  chunk.size <= 0 ||
                  chunk.size > available
                )
                  throw new Error("Capture file limit exceeded");
                if (!bytes) {
                  if (budget.bytes + chunk.size > MAX_CAPTURE_BYTES)
                    throw new Error("Capture file limit exceeded");
                  bytes = new Uint8Array(chunk.size);
                  budget.bytes += chunk.size; // Reserve against other tab workers before the next await.
                }
                const data = Uint8Array.from(atob(chunk.data), (char) => char.charCodeAt(0));
                if (
                  chunk.size !== bytes.length ||
                  !data.length ||
                  offset + data.length > bytes.length
                )
                  throw new Error("Invalid PDF chunk");
                bytes.set(data, offset);
                offset += data.length;
              } while (offset < bytes!.length);
              if (!bytes || controller.signal.aborted) continue;
              let fileName = safeFileName(viewer.name) || "document.pdf";
              if (!/\.pdf$/i.test(fileName)) fileName += ".pdf";
              const pdf: PageSnapshot = {
                ...page,
                url: viewer.frameUrl,
                canonicalUrl: viewer.frameUrl,
                title: fileName,
                text: "",
                textLength: 0,
                file: {
                  url: viewer.frameUrl,
                  originUrl: viewer.frameUrl,
                  fileName,
                  mimeType: "application/pdf",
                  sizeBytes: bytes.length,
                  sha256: await sha256(bytes),
                },
              };
              if (!controller.signal.aborted) accept(pdf, { page: pdf, bytes });
            } catch {
              if (!controller.signal.aborted)
                skipped.push({ tabId: tab.tabId, reason: "PDF viewer document could not be read" });
            }
          }
        } catch {
          /* Restricted frames still leave link and timing discovery available. */
        }
        if (controller.signal.aborted) return;
        const documents = selectDocuments(hints, page.url);
        if (
          /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?)?folders\//.test(page.url) &&
          !documents.length
        )
          skipped.push({
            tabId: tab.tabId,
            reason:
              "No downloadable files were found in this Drive folder. Open a file and capture again.",
          });
        for (const hint of documents) {
          if (controller.signal.aborted) break;
          if (
            !permittedTabs([{ ...current, url: hint.url, finalUrl: hint.url }]).length ||
            (hint.originUrl &&
              !permittedTabs([{ ...current, url: hint.originUrl, finalUrl: hint.originUrl }])
                .length)
          )
            continue;
          try {
            if (/^file:/i.test(hint.url)) {
              if (options.desktop) continue;
              if (!(await api.extension.isAllowedFileSchemeAccess()))
                throw new Error("Open Avenire desktop to capture files from this computer");
            }
            const file = await fetchDocument(
              hint,
              page,
              budget,
              controller.signal,
              options.fetcher,
              (url) => permittedTabs([{ ...current, url, finalUrl: url }]).length > 0,
            );
            if (file && !controller.signal.aborted) accept(file.page, file);
          } catch (error) {
            if (
              !controller.signal.aborted &&
              error instanceof DocumentAccessError &&
              normalizeUrl(resolveDocumentUrl(page.url) ?? "") === normalizeUrl(hint.url)
            ) {
              updated.set(tab.tabId, {
                ...tab,
                access: error.access,
                summary,
                selection: undefined,
                position: undefined,
              });
              for (let index = pages.length - 1; index >= 0; index--)
                if (pages[index]!.tabId === tab.tabId) pages.splice(index, 1);
              skipped.push({ tabId: tab.tabId, reason: error.access });
              return;
            }
            if (!controller.signal.aborted)
              skipped.push({
                tabId: tab.tabId,
                reason: "Document could not be read in this browser session",
              });
          }
        }
      };
      try {
        await within(read(), remaining);
      } catch (error) {
        skipped.push({
          tabId: tab.tabId,
          reason: error instanceof Error ? error.message.slice(0, 500) : "Page capture failed",
        });
      } finally {
        controller.abort();
        clearTimeout(timer);
      }
      // Chrome cannot cancel an injected script. Retire a timed-out slot instead of starting
      // another renderer read alongside that still-running injection.
      if (Date.now() >= tabDeadline) return;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, tabs.length) }, worker));
  for (const tab of tabs.slice(next))
    skipped.push({ tabId: tab.tabId, reason: "Capture timed out" });
  return {
    tabs: [...updated.values()].map(publicTab),
    pages,
    files,
    skipped: skipped.slice(0, 200),
  };
}

export function captureResult(requestId: string, output: CaptureOutput): ExtensionMessage {
  return {
    _tag: "CaptureResult",
    version: 1,
    requestId,
    pages: output.pages,
    skipped: output.skipped,
  };
}
