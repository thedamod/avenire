import {
  CreateSourceUpload,
  LibraryFile,
  SourceUploadTicket,
  SubmitCaptureResult,
  type CaptureOrigin,
  type CaptureSnapshot,
  type CapturedTab,
  type PageSnapshot,
} from "@avenire/contracts";
import { uploadSourceTicket } from "@avenire/storage/client";
import { normalizeUrl, requiresBrowserSession } from "@avenire/capture/url";
import * as Schema from "effect/Schema";
import { captureTabs, type CaptureOutput } from "./capture.ts";
import { sha256 } from "./files.ts";
import { apiJson } from "./wire.ts";
import { resolveDocumentUrl } from "./documents.ts";

function webOrigin(tab: CapturedTab, page: PageSnapshot, capturedAt: string): CaptureOrigin {
  return {
    _tag: "Web",
    url: normalizeUrl(page.file ? (page.file.originUrl ?? page.file.url) : tab.url),
    title: page.title,
    browser: tab.browser,
    capturedAt,
    ...(page.file
      ? {}
      : {
          finalUrl: normalizeUrl(page.url),
          ...(page.canonicalUrl ? { canonicalUrl: normalizeUrl(page.canonicalUrl) } : {}),
        }),
    ...(tab.position ? { position: tab.position } : {}),
  };
}

export function createCaptureUpload(
  appUrl: string,
  snapshot: CaptureSnapshot,
  fetcher: typeof fetch = fetch,
) {
  const uploadedTabs = new Set<number>();
  let saved = 0;
  const uploadPage = async (page: PageSnapshot, output: CaptureOutput): Promise<void> => {
    const tab = output.tabs.find((item) => item.tabId === page.tabId);
    if (!tab || (tab.access !== undefined && tab.access !== "open")) return;
    const original = output.files.find(
      (file) =>
        file.page === page ||
        (file.page.tabId === page.tabId && file.page.file?.sha256 === page.file?.sha256),
    );
    const bytes = page.file ? original?.bytes : new TextEncoder().encode(page.text);
    if (!bytes?.byteLength) return;
    const input = Schema.decodeUnknownSync(CreateSourceUpload)({
      idempotencyKey: crypto.randomUUID(),
      title: (page.title.trim() || "Untitled page").slice(0, 200),
      kind: page.file
        ? page.file.mimeType === "application/pdf"
          ? "pdf"
          : "document"
        : "web-page",
      mimeType: page.file?.mimeType ?? "text/markdown",
      sizeBytes: bytes.byteLength,
      sha256: page.file?.sha256 ?? (await sha256(bytes)),
      ...(/^file:/i.test(page.file?.url ?? page.url)
        ? {
            origin: {
              _tag: "LocalFile",
              deviceId: snapshot.deviceId,
              deviceName: "Browser",
              platform: snapshot.platform,
              fileName: page.file?.fileName ?? "Captured file",
              sizeBytes: bytes.byteLength,
              sha256: page.file?.sha256 ?? (await sha256(bytes)),
              capturedAt: snapshot.capturedAt,
              ...(tab.position ? { position: tab.position } : {}),
            },
          }
        : {
            sourceUrl: new URL(page.url).origin + new URL(page.url).pathname,
            origin: webOrigin(tab, page, snapshot.capturedAt),
          }),
      access: tab.access ?? "open",
    });
    const ticket = await apiJson(fetcher, `${appUrl}/api/library/uploads`, SourceUploadTicket, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!ticket.file) {
      // Only the Avenire upload route may receive cookies or captured bytes.
      const uploadUrl = new URL(ticket.uploadUrl, appUrl);
      if (
        uploadUrl.origin !== appUrl ||
        uploadUrl.pathname !== `/api/library/uploads/${ticket.uploadId}` ||
        uploadUrl.username ||
        uploadUrl.password
      )
        throw new Error("Avenire returned an invalid upload URL");
      await uploadSourceTicket(uploadUrl, new Blob([bytes]), {
        contentType: input.mimeType,
        appFetch: fetcher,
      });
    }
    saved++;
    // A linked attachment must not suppress the parent page's URL capture.
    const primaryUrl = tab.finalUrl ?? tab.url;
    if (
      !page.file ||
      normalizeUrl(page.file.url) === normalizeUrl(primaryUrl) ||
      normalizeUrl(page.file.url) === normalizeUrl(resolveDocumentUrl(primaryUrl) ?? primaryUrl)
    )
      uploadedTabs.add(tab.tabId);
  };
  // A shared three-upload queue across tab deliveries, not three uploads per tab.
  const lanes: Promise<void>[] = Array.from({ length: 3 }, () => Promise.resolve());
  let lane = 0;
  const consume = async (output: CaptureOutput): Promise<void> => {
    await Promise.all(
      output.pages.map((page) => {
        const index = lane++ % lanes.length;
        const work = lanes[index]!.then(() => uploadPage(page, output));
        lanes[index] = work.catch(() => {});
        return work;
      }),
    );
  };
  const finish = async (output: CaptureOutput): Promise<{ saved: number; skipped: number }> => {
    const remaining = output.tabs.filter(
      (tab) =>
        !uploadedTabs.has(tab.tabId) &&
        /^https?:/i.test(tab.url) &&
        /^https?:/i.test(tab.finalUrl ?? tab.url) &&
        !needsBrowser(tab),
    );
    let skipped =
      output.skipped.length +
      output.tabs.filter(
        (tab) =>
          !uploadedTabs.has(tab.tabId) &&
          needsBrowser(tab) &&
          !output.skipped.some((item) => item.tabId === tab.tabId),
      ).length;
    if (remaining.length) {
      const receipt = await apiJson(
        fetcher,
        `${appUrl}/api/library/captures`,
        SubmitCaptureResult,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ snapshot: { ...snapshot, tabs: remaining } }),
        },
      );
      saved += receipt.files.length;
      skipped += receipt.skipped.length;
    }
    return { saved, skipped };
  };
  return { consume, finish };
}

const needsBrowser = (tab: CapturedTab): boolean =>
  [tab.url, tab.finalUrl].some(requiresBrowserSession);

export async function uploadCapture(
  appUrl: string,
  snapshot: CaptureSnapshot,
  output: CaptureOutput,
  fetcher: typeof fetch = fetch,
): Promise<{ saved: number; skipped: number }> {
  const uploader = createCaptureUpload(appUrl, snapshot, fetcher);
  await uploader.consume(output);
  return uploader.finish(output);
}

/** Shortcut and popup share the all-tabs reader and stream uploads as tabs finish. */
export async function captureOpenTabs(
  api: typeof chrome,
  tabs: readonly CapturedTab[],
  readInBrowser: boolean,
  appUrl: string,
  snapshot: CaptureSnapshot,
  fetcher: typeof fetch = fetch,
): Promise<{ saved: number; skipped: number; note?: string }> {
  const uploader = createCaptureUpload(appUrl, snapshot, fetcher);
  const output = await captureTabs(api, tabs, readInBrowser, {
    fetcher,
    retainFiles: false,
    onTab: uploader.consume,
  });
  const result = await uploader.finish(output);
  const unread = output.tabs.find(
    (tab) =>
      needsBrowser(tab) &&
      !output.pages.some(
        (page) =>
          page.tabId === tab.tabId &&
          (!resolveDocumentUrl(tab.finalUrl ?? tab.url) || page.file?.primary),
      ),
  );
  if (!unread) return result;
  const reason =
    output.skipped.find((item) => item.tabId === unread.tabId)?.reason ??
    "Read in browser timed out";
  return {
    ...result,
    note: `Saved ${result.saved} source(s). Needs you · open in browser and capture again. ${reason}`,
  };
}
