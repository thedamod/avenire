import type {
  CaptureOrigin,
  CapturePosition,
  FileId,
  ReopenPlan,
  TextQuote,
} from "@avenire/contracts";
import { mediaKindForUrl, normalizeUrl } from "./url.ts";

export function textFragmentUrl(raw: string, quote: TextQuote): string {
  const encode = (text: string) => encodeURIComponent(text).replace(/-/g, "%2D");
  const prefix = quote.prefix ? `${encode(quote.prefix)}-,` : "";
  const suffix = quote.suffix ? `,-${encode(quote.suffix)}` : "";
  const url = new URL(raw);
  url.hash = `:~:text=${prefix}${encode(quote.exact)}${suffix}`;
  return url.toString();
}

export function pdfPageUrl(raw: string, page: number): string {
  const url = new URL(raw);
  if (Number.isInteger(page) && page >= 1) url.hash = `page=${page}`;
  return url.toString();
}

export function mediaTimeUrl(raw: string, seconds: number): string {
  const url = new URL(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return url.toString();
  const kind = mediaKindForUrl(url);
  if (kind === "youtube") {
    url.searchParams.delete("start");
    url.searchParams.set("t", `${Math.floor(seconds)}s`);
    url.hash = "";
  } else if (kind === "vimeo") {
    url.hash = `t=${seconds}s`;
  } else if (kind === "loom") {
    url.searchParams.set("t", String(seconds));
    url.hash = "";
  }
  return url.toString();
}

export function positionUrl(raw: string, position?: CapturePosition): string {
  const url = normalizeUrl(raw);
  if (position?.textQuote) return textFragmentUrl(url, position.textQuote);
  if (position?.pdfPage !== undefined) return pdfPageUrl(url, position.pdfPage);
  if (position?.mediaSec !== undefined) return mediaTimeUrl(url, position.mediaSec);
  return url;
}

export function planReopen(
  origin: CaptureOrigin | null,
  context: {
    readonly fileId: FileId;
    readonly deviceId?: string;
    readonly extension: boolean;
    readonly desktop: boolean;
  },
): ReopenPlan[] {
  const plans: ReopenPlan[] = [];
  const position = origin?.position === undefined ? {} : { position: origin.position };
  if (origin?._tag === "Web") {
    const url = normalizeUrl(origin.finalUrl ?? origin.url);
    // Stored origins are data, not permission to execute another URL scheme.
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !parsed.username &&
        !parsed.password
      ) {
        if (context.extension) plans.push({ _tag: "FocusTab", url, ...position });
        plans.push({ _tag: "OpenUrl", url: positionUrl(url, origin.position) });
      }
    } catch {
      /* The library viewer remains usable for an invalid origin URL. */
    }
  } else if (
    origin?._tag === "LocalFile" &&
    context.desktop &&
    origin.deviceId === context.deviceId
  ) {
    plans.push({
      _tag: "OpenLocal",
      fileId: context.fileId,
      fileName: origin.fileName,
      ...(origin.appName === undefined ? {} : { appName: origin.appName }),
      ...position,
    });
  }
  plans.push({ _tag: "OpenInLibrary", fileId: context.fileId, ...position });
  return plans;
}
