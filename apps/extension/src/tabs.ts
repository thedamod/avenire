import {
  CapturePosition,
  CaptureSnapshot,
  CapturedTab,
  TextQuote,
  type BrowserKind,
} from "@avenire/contracts";
import { applyPolicy } from "@avenire/capture/policy";
import { normalizeUrl } from "@avenire/capture/url";
import * as Schema from "effect/Schema";
import { within } from "./wire.ts";
import { resolveDocumentUrl } from "./documents.ts";

export const PollReport = Schema.Struct({
  engagement: CapturedTab.fields.engagement,
  position: Schema.optional(CapturePosition),
  selection: Schema.optional(TextQuote),
});
export type PollReport = typeof PollReport.Type;

export function detectBrowser(
  brands: readonly { readonly brand: string }[],
  userAgent: string,
): BrowserKind {
  const source = `${brands.map((entry) => entry.brand).join(" ")} ${userAgent}`;
  for (const [pattern, kind] of [
    [/Brave/i, "brave"],
    [/Microsoft Edge|Edg\//i, "edge"],
    [/Vivaldi/i, "vivaldi"],
    [/Opera|OPR\//i, "opera"],
    [/Arc\//i, "arc"],
    [/Firefox\//i, "firefox"],
    [/Google Chrome|Chromium|Chrome\//i, "chrome"],
  ] as const)
    if (pattern.test(source)) return kind;
  return "other";
}

export function snapshotFor(tabs: readonly CapturedTab[], deviceId: string): CaptureSnapshot {
  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const platform = /Windows/i.test(agent)
    ? "win32"
    : /Macintosh|Mac OS/i.test(agent)
      ? "darwin"
      : "linux";
  return Schema.decodeUnknownSync(CaptureSnapshot)({
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    deviceId,
    platform,
    windows: [],
    tabs,
    media: [],
    collectorNotes: [],
  });
}

/** Policy removes unsafe tabs but older versions omit the access observation: retain it by ID. */
export function permittedTabs(tabs: readonly CapturedTab[]): CapturedTab[] {
  const original = new Map(tabs.map((tab) => [tab.tabId, tab]));
  return applyPolicy(snapshotFor(tabs, "extension")).snapshot.tabs.map((tab) => {
    const observation = original.get(tab.tabId);
    return {
      ...tab,
      ...(observation?.access === undefined ? {} : { access: observation.access }),
      ...(observation?.summary === undefined ? {} : { summary: observation.summary }),
    };
  });
}

export function buildTabReport(
  tabs: readonly chrome.tabs.Tab[],
  browser: BrowserKind,
  polls: ReadonlyMap<number, PollReport> = new Map(),
  redirects: ReadonlyMap<number, string> = new Map(),
): CapturedTab[] {
  const raw: CapturedTab[] = [];
  for (const tab of tabs) {
    if (tab.incognito || tab.id === undefined || tab.id < 0 || tab.windowId < 0 || !tab.url)
      continue;
    const pageUrl = tab.url.startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/")
      ? (resolveDocumentUrl(tab.url) ?? tab.url)
      : tab.url;
    const origin =
      redirects.get(tab.id) ??
      (tab.pendingUrl && tab.pendingUrl !== tab.url ? tab.pendingUrl : undefined);
    const poll = polls.get(tab.id);
    raw.push({
      tabId: tab.id,
      windowId: tab.windowId,
      browser,
      url: origin ?? pageUrl,
      ...(origin ? { finalUrl: pageUrl } : {}),
      title: (tab.title ?? "").slice(0, 2000),
      activeInWindow: tab.active,
      likelyPdf: /\.pdf(?:[?#]|$)|\/pdf(?:[/?#]|$)/i.test(pageUrl),
      engagement: {
        dwellMs: poll?.engagement.dwellMs ?? 0,
        scrollDepthPct: poll?.engagement.scrollDepthPct ?? 0,
        mediaPlaying: !!tab.audible || (poll?.engagement.mediaPlaying ?? false),
      },
      ...(poll?.selection ? { selection: poll.selection } : {}),
      ...(poll?.position ? { position: poll.position } : {}),
    });
  }
  return permittedTabs(raw).slice(0, 200);
}

export function publicTab(tab: CapturedTab): CapturedTab {
  return {
    ...tab,
    url: normalizeUrl(tab.url),
    ...(tab.finalUrl ? { finalUrl: normalizeUrl(tab.finalUrl) } : {}),
  };
}

export async function pollTabs(
  api: typeof chrome,
  browser: BrowserKind,
  redirects: ReadonlyMap<number, string>,
  readSelection = false,
): Promise<CapturedTab[]> {
  const tabs = await api.tabs.query({ windowType: "normal" });
  const safe = buildTabReport(tabs, browser, new Map(), redirects);
  const polls = new Map<number, PollReport>();
  await Promise.all(
    safe.map(async (tab) => {
      try {
        const value: unknown = await within(
          api.tabs.sendMessage(tab.tabId, {
            type: "avenire-poll",
            readSelection,
            expectedUrl: tab.finalUrl ?? tab.url,
          }),
          200,
        );
        polls.set(tab.tabId, Schema.decodeUnknownSync(PollReport)(value));
      } catch {
        /* Restricted, discarded and navigating tabs keep metadata-only engagement. */
      }
    }),
  );
  return buildTabReport(tabs, browser, polls, redirects);
}
