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
import { normalizeUrl } from "@avenire/capture/url";
import * as Schema from "effect/Schema";
import type { CaptureOutput } from "./capture.ts";
import { sha256 } from "./files.ts";
import { apiJson } from "./wire.ts";
import { resolveDocumentUrl } from "./documents.ts";

function webOrigin(tab: CapturedTab, page: PageSnapshot, capturedAt: string): CaptureOrigin {
  return {
    _tag: "Web",
    url: normalizeUrl(page.file ? page.file.url : tab.url),
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

export async function uploadCapture(
  appUrl: string,
  snapshot: CaptureSnapshot,
  output: CaptureOutput,
  fetcher: typeof fetch = fetch,
): Promise<{ readonly saved: number; readonly skipped: number }> {
  const uploadedTabs = new Set<number>();
  let saved = 0;
  const uploadPage = async (page: PageSnapshot): Promise<void> => {
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
      await apiJson(fetcher, uploadUrl.href, LibraryFile, {
        method: "PUT",
        headers: { "content-type": input.mimeType },
        body: bytes,
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
  let next = 0;
  const uploads = await Promise.allSettled(
    Array.from({ length: Math.min(3, output.pages.length) }, async () => {
      while (next < output.pages.length) await uploadPage(output.pages[next++]!);
    }),
  );
  const failed = uploads.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const remaining = output.tabs.filter(
    (tab) =>
      !uploadedTabs.has(tab.tabId) &&
      /^https?:/i.test(tab.url) &&
      /^https?:/i.test(tab.finalUrl ?? tab.url),
  );
  let skipped = output.skipped.length;
  if (remaining.length) {
    const receipt = await apiJson(fetcher, `${appUrl}/api/library/captures`, SubmitCaptureResult, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot: { ...snapshot, tabs: remaining } }),
    });
    saved += receipt.files.length;
    skipped += receipt.skipped.length;
  }
  return { saved, skipped };
}
