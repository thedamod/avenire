import type { CaptureOrigin } from "@avenire/contracts";

export function mediaKindForUrl(url: URL): "youtube" | "vimeo" | "loom" | undefined {
  const host = url.hostname.toLowerCase();
  if (/^(?:(?:www|m)\.)?youtube\.com$|^(?:www\.)?youtu\.be$/.test(host)) return "youtube";
  if (/^(?:www\.|player\.)?vimeo\.com$/.test(host)) return "vimeo";
  if (/^(?:www\.)?loom\.com$/.test(host)) return "loom";
  return undefined;
}

const TRACKING = /^(?:utm_.*|fbclid|gclid|dclid|msclkid|mc_.*|ref_src|_hsenc|_hsmi)$/i;
/** Signed or session parameters must never be stored, even in a reopen URL. */
const SECRET =
  /^(?:token|access_token|id_token|auth|authuser_token|code|key|api_key|sig|signature|session|sessionid|sid|x-amz-.*|x-goog-.*)$/i;

/** Tracking and secret query parameters removed; the hash kept only for PDF pages and media time. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.test(key) || SECRET.test(key)) url.searchParams.delete(key);
    }
    if (!/^#(?:page=|t=)/.test(url.hash)) url.hash = "";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function dedupeKeyFor(origin: CaptureOrigin): string {
  if (origin._tag === "Web") {
    const url = new URL(normalizeUrl(origin.canonicalUrl ?? origin.finalUrl ?? origin.url));
    // Position identifies a place within a source, rather than another source.
    url.hash = "";
    if (mediaKindForUrl(url)) {
      url.searchParams.delete("t");
      url.searchParams.delete("start");
    }
    return `url:${url.toString()}`;
  }
  // The same bytes are the same source, whichever device or folder they were captured from.
  return `content:${origin.sha256}`;
}

/** These signed-in browser surfaces cannot be recovered by the anonymous server fetcher. */
export function requiresBrowserSession(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      /^https?:$/.test(url.protocol) &&
      (url.hostname === "drive.google.com" || url.hostname === "docs.google.com")
    );
  } catch {
    return false;
  }
}
