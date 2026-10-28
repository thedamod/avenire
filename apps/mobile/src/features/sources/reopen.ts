import { planReopen } from "@avenire/capture/reopen";
import type { CapturePosition, LibraryFile } from "@avenire/contracts";

type ReopenFile = Pick<LibraryFile, "id" | "origin" | "sourceUrl">;

const httpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

/**
 * "Open original" on a phone: the page in the browser (at the captured quote, page or time), or
 * Avenire's own viewer for anything that only exists on a computer.
 */
export function phoneReopen(
  file: ReopenFile,
):
  | { readonly _tag: "OpenUrl"; readonly url: string }
  | { readonly _tag: "OpenInLibrary"; readonly position?: CapturePosition | undefined } {
  // Files without a captured origin (pasted links, older captures) still open their address.
  const legacy = file.origin ? null : httpUrl(file.sourceUrl);
  if (legacy) return { _tag: "OpenUrl", url: legacy };
  for (const plan of planReopen(file.origin, { fileId: file.id, desktop: false, extension: false }))
    if (plan._tag === "OpenUrl") {
      const url = httpUrl(plan.url);
      if (url) return { _tag: "OpenUrl", url };
    } else if (plan._tag === "OpenInLibrary")
      return { _tag: "OpenInLibrary", position: plan.position };
  return { _tag: "OpenInLibrary" };
}

/** "arxiv.org" for a page; "Preview · lecture-3.pdf" for a file captured on a computer. */
export function originLabel(file: ReopenFile): string | null {
  const origin = file.origin;
  if (origin?._tag === "LocalFile")
    return origin.appName ? `${origin.appName} · ${origin.fileName}` : origin.fileName;
  const url = httpUrl(origin?._tag === "Web" ? origin.url : file.sourceUrl);
  return url ? new URL(url).hostname.replace(/^www\./, "") : null;
}

/** "Saved on Abhiram's MacBook": a local file's original only exists on that computer. */
export function savedOn(file: ReopenFile): string | null {
  return file.origin?._tag === "LocalFile" && file.origin.deviceName
    ? `Saved on ${file.origin.deviceName}`
    : null;
}
