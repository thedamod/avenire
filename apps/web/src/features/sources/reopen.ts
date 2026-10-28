import { planReopen } from "@avenire/capture/reopen";
import type { CapturePosition, FileId, LibraryFile } from "@avenire/contracts";
import type { AvenireDesktopBridge } from "@avenire/desktop/bridge";

export type ReopenFile = Pick<LibraryFile, "id" | "origin" | "sourceUrl">;

const httpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};

/** "arxiv.org" for a page; "Preview · lecture-3.pdf" for a file captured on a computer. */
export function originLabel(file: ReopenFile): string | null {
  const origin = file.origin;
  if (origin?._tag === "LocalFile")
    return origin.appName ? `${origin.appName} · ${origin.fileName}` : origin.fileName;
  const url = httpUrl(origin?._tag === "Web" ? origin.url : file.sourceUrl);
  return url ? new URL(url).hostname.replace(/^www\./, "") : null;
}

/** "Saved on Abhiram's MacBook" for a local file: the original only exists on that computer. */
export function savedOn(file: ReopenFile): string | null {
  return file.origin?._tag === "LocalFile" && file.origin.deviceName
    ? `Saved on ${file.origin.deviceName}`
    : null;
}

/** Whether "Open original" leads somewhere other than Avenire's own viewer. */
export function hasOriginal(file: ReopenFile, desktop: boolean): boolean {
  if (file.origin?._tag === "LocalFile") return desktop;
  return !!httpUrl(file.origin?._tag === "Web" ? file.origin.url : file.sourceUrl);
}

/** The library viewer at the captured spot: `/sources/<id>?page=4` or `?t=90`. */
export function libraryHref(fileId: FileId, position?: CapturePosition): string {
  if (position?.pdfPage) return `/sources/${fileId}?page=${position.pdfPage}`;
  if (position?.mediaSec !== undefined)
    return `/sources/${fileId}?t=${Math.floor(position.mediaSec)}`;
  return `/sources/${fileId}`;
}

export type BrowserReopen =
  | { readonly _tag: "OpenUrl"; readonly url: string }
  | { readonly _tag: "OpenInLibrary"; readonly href: string };

/** The first plan a web page (no extension, no desktop) can run for this file. */
export function browserReopen(file: ReopenFile): BrowserReopen {
  // Files without a captured origin (pasted links, older captures) still open their address.
  const legacy = file.origin ? null : httpUrl(file.sourceUrl);
  if (legacy) return { _tag: "OpenUrl", url: legacy };
  for (const plan of planReopen(file.origin, { fileId: file.id, desktop: false, extension: false }))
    if (plan._tag === "OpenUrl") {
      const url = httpUrl(plan.url);
      if (url) return { _tag: "OpenUrl", url };
    } else if (plan._tag === "OpenInLibrary")
      return { _tag: "OpenInLibrary", href: libraryHref(plan.fileId, plan.position) };
  return { _tag: "OpenInLibrary", href: libraryHref(file.id) };
}

export interface ReopenEnv {
  /** The desktop shell's bridge; absent in a browser. */
  readonly bridge?: Pick<AvenireDesktopBridge, "reopen"> | undefined;
  readonly open: (url: string) => void;
  readonly navigate: (href: string) => void;
  readonly notify: (message: string) => void;
  /** Records the `opened` file event for a reopen the desktop didn't run itself. */
  readonly opened: (fileId: FileId) => void;
  /** The stored bytes, when the caller has them: opened instead of the library viewer. */
  readonly stored?: string | undefined;
  /** The pathname, so a reopen into the viewer already on screen does nothing. */
  readonly pathname?: string | undefined;
}

export const REOPEN_CHANGED = "Changed since you captured it";
export const REOPEN_MISSING = "Couldn't find it on this computer";

/**
 * "Open original": the desktop reopens where the student left it (their tab, their app, their
 * file) and records the event itself; a browser runs the first plan it can.
 */
export async function reopenFile(file: ReopenFile, env: ReopenEnv): Promise<void> {
  if (env.bridge && file.origin) {
    const result = await env.bridge.reopen(file.id).catch(() => ({ ok: false, note: "missing" }));
    if (result.ok) {
      if (result.note === "changed-since-capture") env.notify(REOPEN_CHANGED);
      return;
    }
    // A file from another computer quietly opens the library copy; "Saved on …" already says why.
    if (file.origin._tag === "LocalFile" && result.note === "missing") env.notify(REOPEN_MISSING);
  }
  const plan = browserReopen(file);
  if (plan._tag === "OpenUrl") {
    env.open(plan.url);
    env.opened(file.id);
  } else if (env.stored) env.open(env.stored);
  else if (env.pathname !== plan.href.split("?")[0]) env.navigate(plan.href);
}
