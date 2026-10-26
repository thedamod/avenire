import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";
import { captureCandidates } from "@avenire/capture/candidates";
import { applyPolicy } from "@avenire/capture/policy";
import { classifyAccess } from "@avenire/capture/access";
import { normalizeUrl } from "@avenire/capture/url";
import type {
  CaptureSnapshot,
  CapturedTab,
  CaptureOrigin,
  FileKind,
  LibraryFile,
} from "@avenire/contracts";
import type { CapturePayload, CaptureStarted } from "../bridge.ts";
import { CaptureProgressStream } from "./progress.ts";
import { UploadGate } from "./hash-cache.ts";
import { formats, uploadCapturedFiles } from "./upload.ts";
import { acquireAndUploadSource, type AvenireUploadFetch } from "./source-acquisition.ts";
import type { LocalOriginRegistry } from "./registry.ts";
import type { ExtensionChannel, BrowserPage } from "./channel.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const tabKey = (tab: CapturedTab) =>
  `tab:${tab.browser}:${tab.windowId}:${tab.tabId}:${hash(normalizeUrl(tab.url)).slice(0, 16)}`;
const localKey = (path: string) => `local:${hash(path).slice(0, 20)}`;
export function captureItems(snapshot: CaptureSnapshot): CaptureStarted["items"] {
  const items = new Map<string, CaptureStarted["items"][number]>();
  const { candidates } = captureCandidates(snapshot, hash);
  for (const tab of snapshot.tabs) {
    if (!candidates.some((candidate) => candidate.url === normalizeUrl(tab.finalUrl ?? tab.url)))
      continue;
    const key = tabKey(tab);
    items.set(key, {
      key,
      title: tab.title.slice(0, 200),
      kind: tab.likelyPdf ? "pdf" : "web-page",
      status: "pending",
    });
  }
  snapshot.windows.forEach((entry, index) => {
    const key = entry.filePath ? localKey(entry.filePath) : `window:${index}`;
    items.set(key, {
      key,
      title: (entry.filePath ? basename(entry.filePath) : entry.title).slice(0, 200),
      kind: "document",
      status: "pending",
    });
  });
  return [...items.values()];
}
const webOrigin = (
  tab: CapturedTab,
  page: BrowserPage["page"],
  capturedAt: string,
): CaptureOrigin => ({
  _tag: "Web",
  url: normalizeUrl(tab.url),
  title: page.title || tab.title,
  browser: tab.browser,
  capturedAt,
  ...(tab.finalUrl ? { finalUrl: normalizeUrl(tab.finalUrl) } : {}),
  ...(page.canonicalUrl ? { canonicalUrl: normalizeUrl(page.canonicalUrl) } : {}),
  ...(tab.position || tab.selection
    ? { position: { ...tab.position, ...(tab.selection ? { textQuote: tab.selection } : {}) } }
    : {}),
});
const fileKind = (mime: string): FileKind | undefined => {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return Object.values(formats).find((format) => format[1] === mime)?.[0];
};

export async function runCapturePipeline(options: {
  readonly initial: CapturePayload;
  readonly resolve: () => Promise<CaptureSnapshot>;
  readonly session: Promise<AvenireUploadFetch>;
  readonly appUrl: string;
  readonly owner: string;
  readonly registry: LocalOriginRegistry;
  readonly stream: CaptureProgressStream;
  readonly channel?: Pick<ExtensionChannel, "capture" | "latestTabs" | "release">;
  readonly readInBrowser: boolean;
  readonly signal: AbortSignal;
}): Promise<CapturePayload> {
  const { stream, signal, initial } = options;
  const files: LibraryFile[] = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const gate = new UploadGate(3);
  const processed = new Set<string>();
  const blockedTabs = new Set<string>();
  const annotations = new Map<
    string,
    { access: "paywalled" | "login-required"; summary: string }
  >();
  let blocked = [...initial.blocked];
  const browser = async (result: BrowserPage) => {
    const { tab, page } = result;
    const baseKey = tabKey(tab);
    const key = page.file ? `${baseKey}:file:${page.file.sha256}` : baseKey;
    if (page.file)
      stream.progress({
        key,
        status: "pending",
        title: page.file.fileName || page.title,
        kind: fileKind(page.file.mimeType) ?? "document",
      });
    try {
      signal.throwIfAborted();
      // Treat extraction metadata as untrusted, including navigations after the instant report.
      const checked = applyPolicy({
        ...initial.snapshot,
        windows: [],
        media: [],
        tabs: [
          { ...tab, url: page.url, ...(page.canonicalUrl ? { finalUrl: page.canonicalUrl } : {}) },
        ],
      });
      const checkedFile = page.file
        ? applyPolicy({
            ...initial.snapshot,
            windows: [],
            media: [],
            tabs: [{ ...tab, url: page.file.url, finalUrl: page.file.url }],
          })
        : undefined;
      if (checkedFile && !checkedFile.snapshot.tabs.length) {
        blocked.push(...checkedFile.blocked);
        stream.progress({
          key,
          status: "skipped",
          reason: "This source is excluded by capture policy.",
        });
        return;
      }
      if (!checked.snapshot.tabs.length) {
        blocked.push(...checked.blocked);
        blockedTabs.add(baseKey);
        processed.add(baseKey);
        stream.progress({
          key,
          status: "skipped",
          reason: "This source is excluded by capture policy.",
        });
        return;
      }
      const access = classifyAccess(page.signals);
      if (access !== "open") {
        annotations.set(baseKey, {
          access,
          summary: (page.abstract || page.description).slice(0, 10000),
        });
        stream.progress({
          key,
          status: "skipped",
          reason:
            access === "paywalled"
              ? "Paywalled page; your capture setting will be applied."
              : "Sign-in required; your capture setting will be applied.",
        });
        return;
      }
      if (!options.readInBrowser) return;
      const kind = page.file ? fileKind(page.file.mimeType.toLowerCase()) : "web-page";
      if (!kind || (page.file && !result.path) || (!page.file && !page.text.trim()))
        throw new Error(
          "No supported original or readable page text was returned. Open the original and capture again.",
        );
      const fetch = await options.session;
      const sourceTab = page.file
        ? { ...tab, url: page.file.url, finalUrl: page.url }
        : { ...tab, finalUrl: page.url };
      const origin = webOrigin(sourceTab, page, initial.snapshot.capturedAt);
      const file = await gate.run(async () => {
        signal.throwIfAborted();
        stream.progress({ key, status: "uploading" });
        if (page.file) stream.progress({ key: baseKey, status: "uploading" });
        return acquireAndUploadSource(
          result.path
            ? { type: "local-file", path: result.path }
            : { type: "browser-blob", blob: new Blob([page.text], { type: "text/markdown" }) },
          {
            idempotencyKey: randomUUID(),
            title: (page.title || tab.title || "Captured page").slice(0, 200),
            kind,
            mimeType: page.file?.mimeType ?? "text/markdown",
            sourceUrl: page.file?.url ?? tab.url,
            origin,
            access,
          },
          { appUrl: options.appUrl, avenireFetch: fetch, signal, maxBytes: 64 * 1024 * 1024 },
        );
      });
      files.push(file);
      processed.add(baseKey);
      stream.progress({ key, status: "saved", file });
      if (page.file) stream.progress({ key: baseKey, status: "saved", file });
    } catch {
      const reason =
        "Could not save this browser source. Reconnect the extension, check sign-in and capture again.";
      skipped.push({ title: tab.title.slice(0, 200), reason });
      stream.progress({ key, status: "failed", reason });
    } finally {
      await options.channel?.release(result);
    }
  };
  const nativeWork = (async () => {
    const resolved = applyPolicy(await options.resolve());
    signal.throwIfAborted();
    const keyForPath = (path: string) => {
      const index = resolved.snapshot.windows.findIndex((entry) => entry.filePath === path);
      const resolvedWindow = resolved.snapshot.windows[index];
      const initialIndex = initial.snapshot.windows.findIndex(
        (entry) =>
          entry.appName === resolvedWindow?.appName && entry.title === resolvedWindow.title,
      );
      const initialWindow = initial.snapshot.windows[initialIndex];
      const key =
        initialWindow && !initialWindow.filePath ? `window:${initialIndex}` : localKey(path);
      if (!stream.started.items.some((item) => item.key === key))
        stream.progress({
          key,
          status: "pending",
          title: basename(path).slice(0, 200),
          kind: "document",
        });
      return key;
    };
    const uploads = await uploadCapturedFiles(
      resolved.snapshot,
      options.appUrl,
      await options.session,
      signal,
      {
        owner: options.owner,
        registry: options.registry,
        gate,
        keyForPath,
        progress: (key, status, file, reason) =>
          stream.progress({
            key,
            status,
            ...(file ? { file } : {}),
            ...(reason ? { reason } : {}),
          }),
      },
    );
    files.push(...uploads.files);
    skipped.push(...uploads.skipped);
  })();
  // Each branch handles its own receipt; no rejection leaves other uploads running unobserved.
  const results = await Promise.allSettled([
    nativeWork,
    options.channel?.capture(
      initial.snapshot.tabs,
      options.readInBrowser,
      signal,
      browser,
      (tab, reason) => {
        stream.progress({ key: tabKey(tab), status: "failed", reason });
        skipped.push({ title: tab.title.slice(0, 200), reason });
      },
    ) ?? Promise.resolve([]),
  ]);
  signal.throwIfAborted();
  if (results[0]?.status === "rejected") {
    for (const item of stream.started.items.filter((item) => !item.key.startsWith("tab:")))
      stream.progress({
        key: item.key,
        status: "failed",
        reason: "Could not read this document. Check file access and sign-in, then capture again.",
      });
  }
  if (options.readInBrowser) {
    for (const tab of options.channel?.latestTabs() ?? []) {
      if (tab.access !== "paywalled" && tab.access !== "login-required") continue;
      const initialTab = initial.snapshot.tabs.find((entry) => tabKey(entry) === tabKey(tab));
      if (!initialTab || tab.url !== initialTab.url) continue;
      annotations.set(tabKey(tab), {
        access: tab.access,
        summary: tab.summary?.slice(0, 10000) ?? "",
      });
      stream.progress({
        key: tabKey(tab),
        status: "skipped",
        reason:
          tab.access === "paywalled"
            ? "Paywalled page; your capture setting will be applied."
            : "Sign-in required; your capture setting will be applied.",
      });
    }
  }
  for (const item of stream.started.items) {
    if (!stream.settled(item.key))
      stream.progress({
        key: item.key,
        status: "skipped",
        reason: item.key.startsWith("tab:")
          ? "Queued for server capture; browser content was unavailable."
          : "No supported document path was found. Open the file and capture again.",
      });
  }
  return {
    snapshot: {
      ...initial.snapshot,
      windows: [],
      media: initial.snapshot.media.filter((entry) => !entry.filePath),
      tabs: initial.snapshot.tabs
        .filter(
          (tab) => (!processed.has(tabKey(tab)) || tab.selection) && !blockedTabs.has(tabKey(tab)),
        )
        .map((tab) => ({
          ...tab,
          ...(annotations.has(tabKey(tab))
            ? { selection: undefined, position: undefined, ...annotations.get(tabKey(tab)) }
            : {}),
        })),
    },
    blocked,
    uploads: { files, skipped },
  };
}
