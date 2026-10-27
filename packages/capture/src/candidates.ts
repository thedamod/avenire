import type {
  CaptureOrigin,
  CapturePosition,
  CaptureSnapshot,
  CapturedTab,
  FileKind,
  SourceAccess,
} from "@avenire/contracts";
import { applyPolicy } from "./policy.ts";
import { dedupeKeyFor, normalizeUrl } from "./url.ts";

export interface CaptureCandidate {
  readonly title: string;
  readonly kind: FileKind;
  readonly dedupeKey: string;
  readonly url: string | null;
  readonly origin: CaptureOrigin;
  readonly text?: string;
  readonly position?: number;
  /** Observed in the browser; absent when nobody read the page. */
  readonly access?: SourceAccess;
  readonly summary?: string;
}

export const isEngaged = (tab: CapturedTab): boolean =>
  tab.engagement.dwellMs >= 8000 ||
  tab.engagement.scrollDepthPct >= 15 ||
  tab.engagement.mediaPlaying;

/** Local filesystem paths never become server reads. Native clients must upload their bytes. */
export function captureCandidates(snapshot: CaptureSnapshot, hash: (text: string) => string) {
  const policy = applyPolicy(snapshot);
  const candidates = new Map<string, CaptureCandidate>();
  const skipped = policy.blocked.map((entry) => ({
    title: entry.title,
    reason: entry.category as string,
  }));
  const addTab = (tab: CapturedTab, kind: FileKind, position?: CapturePosition) => {
    const url = normalizeUrl(tab.finalUrl ?? tab.url);
    const origin: CaptureOrigin = {
      _tag: "Web",
      url: normalizeUrl(tab.url),
      title: tab.title,
      browser: tab.browser,
      capturedAt: snapshot.capturedAt,
      ...(tab.finalUrl === undefined ? {} : { finalUrl: normalizeUrl(tab.finalUrl) }),
      ...(position === undefined ? {} : { position }),
    };
    const dedupeKey = dedupeKeyFor(origin);
    candidates.set(dedupeKey, {
      title: tab.title.trim().slice(0, 500) || new URL(url).hostname,
      kind,
      url,
      origin,
      dedupeKey,
      ...(position?.mediaSec === undefined ? {} : { position: position.mediaSec }),
      ...(tab.access === undefined ? {} : { access: tab.access }),
      ...(tab.summary === undefined ? {} : { summary: tab.summary }),
    });
    return origin;
  };
  for (const tab of policy.snapshot.tabs) {
    // Local paths are handled by device uploads, never by a server URL fetch.
    if (!/^https?:/i.test(tab.url) || !/^https?:/i.test(tab.finalUrl ?? tab.url)) continue;
    const origin = addTab(tab, tab.likelyPdf ? "pdf" : "web-page", tab.position);
    if (tab.selection) {
      const text = tab.selection.exact.trim();
      if (!text) continue;
      const selectionOrigin: CaptureOrigin = {
        ...origin,
        position: { ...tab.position, textQuote: tab.selection },
      };
      const dedupeKey = `selection:${dedupeKeyFor(origin)}:${hash(text)}`;
      candidates.set(dedupeKey, {
        title: `Selection from ${tab.title}`.slice(0, 500),
        kind: "selection",
        url: normalizeUrl(tab.finalUrl ?? tab.url),
        origin: selectionOrigin,
        text,
        dedupeKey,
      });
    }
  }
  for (const media of policy.snapshot.media) {
    const tab = policy.snapshot.tabs.find(
      (tab) => tab.title === media.title && (tab.url === media.url || tab.finalUrl === media.url),
    );
    if (media.url && tab)
      addTab(tab, "video", {
        ...tab.position,
        ...(media.positionSec === undefined ? {} : { mediaSec: media.positionSec }),
      });
    else
      skipped.push({
        title: media.title,
        reason: "Upload this local media file to capture its contents",
      });
  }
  for (const window of policy.snapshot.windows) {
    if (window.filePath)
      skipped.push({
        title: window.title,
        reason: "Upload this local file to capture its contents",
      });
  }
  return { snapshot: policy.snapshot, candidates: [...candidates.values()], skipped };
}
