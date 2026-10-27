import type { PageSnapshot } from "@avenire/contracts";
import { MAX_SOURCE_UPLOAD_BYTES } from "@avenire/contracts";
import { safeFileName, MAX_CAPTURE_BYTES, type FileBudget } from "./files.ts";
import { DOCUMENT_MIMES, documentExtension, type DocumentHint } from "./documents.ts";

// Store listing: downloads saves login-gated originals using the user's browser session;
// downloads.ui hides capture's download shelf temporarily and restores it when capture ends.
const holders = new WeakMap<object, { count: number; previous: boolean }>();
export async function hideCaptureDownloads(api: typeof chrome): Promise<() => Promise<void>> {
  let state = holders.get(api);
  if (!state) {
    // Chrome exposes no getter for UI options; restore the default enabled state.
    const previous = true;
    await api.downloads.setUiOptions({ enabled: false });
    state = { count: 0, previous };
    holders.set(api, state);
  }
  state.count++;
  return async () => {
    if (--state!.count === 0) {
      holders.delete(api);
      await api.downloads.setUiOptions({ enabled: state!.previous });
    }
  };
}
const parts = (path: string) => path.replace(/\\/g, "/").split("/");
const downloadCaptureId = (path: string): string | undefined => {
  const p = parts(path);
  const index = p.lastIndexOf("Avenire");
  return index >= 0 && p.length === index + 3 ? p[index + 1] : undefined;
};
export async function downloadDocument(
  api: typeof chrome,
  hint: DocumentHint,
  page: PageSnapshot,
  budget: FileBudget,
  signal: AbortSignal,
  captureId: string,
  pageSince: number,
  reusablePaths?: readonly string[],
  permitted: (url: string) => boolean = () => true,
): Promise<PageSnapshot | undefined> {
  signal.throwIfAborted();
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(captureId)) throw new Error("Invalid capture identifier");
  const key = hint.url.split("#")[0]!;
  if (budget.urls.has(key)) return undefined;
  if (!hint.primary && budget.count >= 10)
    throw new Error("Discovered-link limit reached (10 per tab)");
  budget.urls.add(key);
  if (!hint.primary) budget.count++;
  const existing = await api.downloads.search({ url: hint.url, exists: true, state: "complete" });
  signal.throwIfAborted();
  let item = existing
    .filter(
      (entry) =>
        downloadCaptureId(entry.filename) &&
        Date.parse(entry.endTime ?? entry.startTime) >= pageSince &&
        (!reusablePaths ||
          reusablePaths.includes(entry.filename) ||
          downloadCaptureId(entry.filename) === captureId),
    )
    .sort((a, b) => Date.parse(b.endTime ?? b.startTime) - Date.parse(a.endTime ?? a.startTime))[0];
  let id: number | undefined;
  if (!item) {
    const ext =
      documentExtension(hint.url) ||
      new URL(hint.url).searchParams.get("format") ||
      /\.([a-z0-9]{1,5})$/i.exec(hint.name || page.title)?.[1]?.toLowerCase() ||
      "";
    let name = safeFileName(hint.name || page.title || "document").slice(0, 180) || "document";
    if (DOCUMENT_MIMES[ext] && !name.toLowerCase().endsWith(`.${ext}`)) name += `.${ext}`;
    // Register before download/search: completion may occur before download() resolves.
    let wake = () => {};
    const changed = () => wake();
    api.downloads.onChanged.addListener(changed);
    const abort = () => wake();
    signal.addEventListener("abort", abort);
    try {
      id = await api.downloads.download({
        url: hint.url,
        filename: `Avenire/${captureId}/${name}`,
        conflictAction: "uniquify",
        saveAs: false,
      });
      signal.throwIfAborted();
      for (;;) {
        const waiting = new Promise<void>((resolve) => {
          wake = resolve;
        });
        item = (await api.downloads.search({ id }))[0];
        signal.throwIfAborted();
        if (item?.state === "complete") break;
        if (item?.state === "interrupted")
          throw new Error(`Browser download interrupted: ${item.error || "unknown reason"}`);
        await waiting;
        signal.throwIfAborted();
      }
    } catch (error) {
      if (id !== undefined) await api.downloads.cancel(id).catch(() => {});
      if (signal.aborted) throw new Error("Browser download timed out");
      throw error;
    } finally {
      api.downloads.onChanged.removeListener(changed);
      signal.removeEventListener("abort", abort);
    }
  }
  if (!item || !permitted(item.finalUrl || item.url))
    throw new Error("Document redirect blocked by capture policy");
  const sizeBytes = item.fileSize;
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_SOURCE_UPLOAD_BYTES ||
    budget.bytes + sizeBytes > MAX_CAPTURE_BYTES
  )
    throw new Error("Capture file limit exceeded");
  budget.bytes += sizeBytes;
  const fileName = parts(item.filename).pop()!;
  const ext = documentExtension(`https://local.invalid/${encodeURIComponent(fileName)}`);
  const mimeType =
    item.mime === "application/octet-stream" || !item.mime ? DOCUMENT_MIMES[ext] : item.mime;
  if (!mimeType || !Object.values(DOCUMENT_MIMES).includes(mimeType))
    throw new Error("Unsupported document type");
  const storedId = downloadCaptureId(item.filename);
  if (!storedId) throw new Error("Browser download was saved outside Avenire");
  return {
    ...page,
    title: fileName.slice(0, 2000),
    text: "",
    textLength: 0,
    download: {
      path: item.filename,
      captureId: storedId,
      mimeType,
      sizeBytes,
      url: hint.url,
      originUrl: page.url,
      ...(hint.primary ? { primary: true } : {}),
    },
  };
}
