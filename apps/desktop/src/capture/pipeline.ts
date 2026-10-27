import { hostname } from "node:os";
import { localBasename, uploadName } from "./local-file.ts";
import { captureLog, captureError } from "./diagnostics.ts";
import { captureFailureReason } from "./failure.ts";
import { createHash, randomUUID } from "node:crypto";
import { localFilePath, displayTitle, localPathIdentity } from "./local-file.ts";
import { applyPolicy } from "@avenire/capture/policy";
import { classifyAccess } from "@avenire/capture/access";
import { normalizeUrl, requiresBrowserSession } from "@avenire/capture/url";
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
/** Also translates access codes from older paired extensions before they reach the overlay. */
export const browserFailureReason = (reason: string): string =>
  reason === "login-required"
    ? "Sign in to Google with the account that can open this file, then capture again."
    : reason === "paywalled"
      ? "This page requires a subscription. Open it in your browser and capture again."
      : reason;
export const tabKey = (tab: CapturedTab) =>
  `tab:${tab.browser}:${tab.windowId}:${tab.tabId}:${hash(normalizeUrl(tab.url)).slice(0, 16)}`;
const tabFilePath = (tab: CapturedTab, platform: CaptureSnapshot["platform"]) => {
  try {
    return localFilePath(tab.finalUrl ?? tab.url, platform);
  } catch {
    return undefined;
  }
};
const localKey = (path: string, platform: CaptureSnapshot["platform"]) =>
  `local:${hash(localPathIdentity(path, platform)).slice(0, 20)}`;
export function captureItems(snapshot: CaptureSnapshot): CaptureStarted["items"] {
  const items = new Map<string, CaptureStarted["items"][number]>();
  for (const tab of snapshot.tabs) {
    const key = tabKey(tab);
    items.set(key, {
      key,
      title: displayTitle(tab.title, tabFilePath(tab, snapshot.platform)),
      kind: tab.likelyPdf ? "pdf" : "web-page",
      status: "pending",
    });
  }
  snapshot.windows.forEach((entry, index) => {
    if (!entry.filePath) return;
    if (
      entry.filePath &&
      snapshot.tabs.some(
        (tab) =>
          localPathIdentity(tabFilePath(tab, snapshot.platform) ?? "", snapshot.platform) ===
          localPathIdentity(entry.filePath!, snapshot.platform),
      )
    )
      return;
    const key = entry.filePath ? localKey(entry.filePath, snapshot.platform) : `window:${index}`;
    items.set(key, {
      key,
      title: displayTitle(entry.title, entry.filePath),
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
  title: displayTitle(page.title || tab.title),
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
  const browserFailures = new Map<string, string>();
  const blockedTabs = new Set<string>();
  const annotations = new Map<
    string,
    { access: "paywalled" | "login-required"; summary: string }
  >();
  let blocked = [...initial.blocked];
  let resolvedSnapshot = initial.snapshot;
  const browser = async (result: BrowserPage) => {
    const { tab, page } = result;
    const baseKey = tabKey(tab);
    const document = page.download ?? page.file;
    const key = document
      ? `${baseKey}:file:${page.file?.sha256 ?? hash(page.download!.url).slice(0, 20)}`
      : baseKey;
    if (document)
      stream.progress({
        key,
        status: "pending",
        title: displayTitle(page.file?.fileName || page.title),
        kind: fileKind(document!.mimeType) ?? "document",
      });
    try {
      signal.throwIfAborted();
      if (
        [page.url, page.canonicalUrl, document?.url, document?.originUrl].some(
          (url) => url && /^file:/i.test(url),
        )
      ) {
        stream.progress({
          key,
          status: "skipped",
          reason: "Local files are captured by Avenire desktop.",
        });
        return;
      }
      // Treat extraction metadata as untrusted, including navigations after the instant report.
      const checked = applyPolicy({
        ...initial.snapshot,
        windows: [],
        media: [],
        tabs: [
          { ...tab, url: page.url, ...(page.canonicalUrl ? { finalUrl: page.canonicalUrl } : {}) },
        ],
      });
      const checkedFile = document
        ? applyPolicy({
            ...initial.snapshot,
            windows: [],
            media: [],
            tabs: [{ ...tab, url: document.url, finalUrl: document.originUrl ?? document.url }],
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
        if ([tab.url, tab.finalUrl].some(requiresBrowserSession)) {
          browserFailures.set(baseKey, access);
          return;
        }
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
      const kind = document ? fileKind(document.mimeType.toLowerCase()) : "web-page";
      if (!kind || (document && !result.path) || (!document && !page.text.trim()))
        throw new Error(
          "No supported original or readable page text was returned. Open the original and capture again.",
        );
      const fetch = await options.session;
      const sourceTab = document
        ? {
            ...tab,
            url: document.originUrl ?? document.url,
            finalUrl: document.originUrl ?? page.url,
          }
        : { ...tab, finalUrl: page.url };
      const origin = webOrigin(sourceTab, page, initial.snapshot.capturedAt);
      const file = await gate.run(async () => {
        signal.throwIfAborted();
        stream.progress({ key, status: "uploading" });
        if (document) stream.progress({ key: baseKey, status: "uploading" });
        return acquireAndUploadSource(
          result.path
            ? { type: "local-file", path: result.path }
            : { type: "browser-blob", blob: new Blob([page.text], { type: "text/markdown" }) },
          {
            idempotencyKey: randomUUID(),
            title: displayTitle(page.title || tab.title || "Captured page"),
            kind,
            mimeType: document?.mimeType ?? "text/markdown",
            sourceUrl: page.download ? normalizeUrl(tab.url) : (document?.url ?? tab.url),
            origin,
            access,
          },
          {
            appUrl: options.appUrl,
            avenireFetch: fetch,
            signal,
            ...(page.download && result.path
              ? {
                  localOrigin: {
                    _tag: "LocalFile" as const,
                    deviceId: initial.snapshot.deviceId,
                    deviceName: hostname(),
                    platform: initial.snapshot.platform,
                    fileName: uploadName(localBasename(result.path)),
                    capturedAt: initial.snapshot.capturedAt,
                    originUrl: normalizeUrl(tab.url),
                  },
                  onLocalUploaded: (
                    file: LibraryFile,
                    local: import("./registry.ts").LocalOrigin,
                  ) =>
                    options.registry.record(options.owner, file.id, {
                      ...local,
                      originUrl: normalizeUrl(tab.url),
                      ...(result.downloadWindow && page.download
                        ? {
                            download: {
                              ...result.downloadWindow,
                              url: page.download.url,
                              reportedPath: page.download.path,
                            },
                          }
                        : {}),
                    }),
                }
              : {}),
          },
        );
      });
      files.push(file);
      processed.add(baseKey);
      stream.progress({ key, status: "saved", file });
      if (document) stream.progress({ key: baseKey, status: "saved", file });
    } catch (error) {
      captureLog("Browser source failed", captureError(error));
      const reason = captureFailureReason(error);
      skipped.push({
        title: displayTitle(tab.title, tabFilePath(tab, initial.snapshot.platform)),
        reason,
      });
      stream.progress({
        key,
        status: /256 MB|file limit exceeded/i.test(reason) ? "skipped" : "failed",
        reason,
      });
    } finally {
      await options.channel?.release(result);
    }
  };
  const nativeWork = (async () => {
    const resolved = applyPolicy(await options.resolve());
    resolvedSnapshot = resolved.snapshot;
    blocked.push(...resolved.blocked);
    signal.throwIfAborted();
    const keyForPath = (path: string) => {
      const fileTab = resolved.snapshot.tabs.find(
        (tab) =>
          localPathIdentity(
            tabFilePath(tab, resolved.snapshot.platform) ?? "",
            resolved.snapshot.platform,
          ) === localPathIdentity(path, resolved.snapshot.platform),
      );
      if (fileTab) return tabKey(fileTab);
      const index = resolved.snapshot.windows.findIndex(
        (entry) =>
          localPathIdentity(entry.filePath ?? "", resolved.snapshot.platform) ===
          localPathIdentity(path, resolved.snapshot.platform),
      );
      const resolvedWindow = resolved.snapshot.windows[index];
      const initialIndex = initial.snapshot.windows.findIndex(
        (entry) =>
          entry.appName === resolvedWindow?.appName && entry.title === resolvedWindow.title,
      );
      const initialWindow = initial.snapshot.windows[initialIndex];
      const key =
        initialWindow && !initialWindow.filePath
          ? `window:${initialIndex}`
          : localKey(path, resolved.snapshot.platform);
      if (!stream.started.items.some((item) => item.key === key))
        stream.progress({
          key,
          status: "pending",
          title: displayTitle(path),
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
      initial.snapshot.tabs.filter(
        (tab) => !/^file:/i.test(tab.url) && !/^file:/i.test(tab.finalUrl ?? tab.url),
      ),
      options.readInBrowser,
      signal,
      browser,
      (tab, reason) => {
        reason = browserFailureReason(reason);
        browserFailures.set(tabKey(tab), reason);
        skipped.push({
          title: displayTitle(tab.title, tabFilePath(tab, initial.snapshot.platform)),
          reason,
        });
      },
      (tab) => stream.progress({ key: tabKey(tab), status: "uploading" }),
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
      if ([tab.url, tab.finalUrl].some(requiresBrowserSession)) continue;
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
  for (const tab of initial.snapshot.tabs) {
    const key = tabKey(tab);
    if (processed.has(key) || blockedTabs.has(key)) continue;
    const google = [tab.url, tab.finalUrl].some(requiresBrowserSession);
    const reason =
      browserFailures.get(key) ??
      (options.readInBrowser
        ? "Read in browser timed out"
        : "Turn on “Capture pages you're logged into” in Settings to read this in your browser.");
    if (google) {
      blockedTabs.add(key);
      const detail = browserFailureReason(reason);
      stream.progress({ key, status: "skipped", reason: detail });
      skipped.push({ title: displayTitle(tab.title), reason: detail });
    } else if (!stream.settled(key)) {
      stream.progress({ key, status: "skipped", reason });
    }
  }
  for (const item of stream.started.items) {
    if (!stream.settled(item.key))
      stream.progress({
        key: item.key,
        status: "skipped",
        reason: "No supported document path was found. Open the file and capture again.",
      });
  }
  return {
    snapshot: {
      ...initial.snapshot,
      windows: [],
      media: resolvedSnapshot.media.filter((entry) => !entry.filePath),
      tabs: resolvedSnapshot.tabs
        .filter(
          (tab) =>
            /^https?:/i.test(tab.url) &&
            /^https?:/i.test(tab.finalUrl ?? tab.url) &&
            (!processed.has(tabKey(tab)) || tab.selection) &&
            !blockedTabs.has(tabKey(tab)),
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
