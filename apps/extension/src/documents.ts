/** The URL resolver stays in the worker; discovery returns only DOM URL hints. */
export const DOCUMENT_MIMES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  txt: "text/plain",
  md: "text/markdown",
  epub: "application/epub+zip",
};
export function documentExtension(raw: string): string {
  try {
    return (
      /\.([a-z0-9]{1,5})$/i.exec(decodeURIComponent(new URL(raw).pathname))?.[1]?.toLowerCase() ??
      ""
    );
  } catch {
    return "";
  }
}

export function googleExportUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return undefined;
  const match = /^\/(document|presentation|spreadsheets)\/(?:u\/(\d+)\/)?d\/([\w-]+)/.exec(
    url.pathname,
  );
  const drive = /^\/file\/(?:u\/(\d+)\/)?d\/([\w-]+)/.exec(url.pathname);
  let result: URL;
  if (url.hostname === "docs.google.com" && match) {
    const format = match[1] === "document" ? "docx" : match[1] === "presentation" ? "pdf" : "xlsx";
    result = new URL(`https://docs.google.com/${match[1]}/d/${match[3]}/export?format=${format}`);
  } else if (url.hostname === "drive.google.com" && drive) {
    result = new URL(`https://drive.google.com/uc?export=download&id=${drive[2]}`);
  } else return undefined;
  const account = url.searchParams.get("authuser") ?? match?.[2] ?? drive?.[1];
  if (account && /^\d{1,2}$/.test(account)) result.searchParams.set("authuser", account);
  return result.href;
}

export function resolveDocumentUrl(raw: string, base?: string): string | undefined {
  try {
    const url = new URL(raw, base);
    // Chromium's built-in PDF viewer sometimes exposes an extension URL with ?file=.
    const builtin =
      url.protocol === "chrome-extension:" && url.hostname === "mhjfbmdgcfjbbpaeojofohoefgiehjai";
    if ((!/^(?:https?|file):$/.test(url.protocol) && !builtin) || url.username || url.password)
      return undefined;
    const exported = googleExportUrl(url.href);
    if (exported) return exported;
    const inner =
      /(?:^|\/)viewer\.html$/i.test(url.pathname) || builtin
        ? url.searchParams.get("file")
        : /(^|\.)officeapps\.live\.com$/.test(url.hostname)
          ? url.searchParams.get("src")
          : url.hostname === "docs.google.com" &&
              /^\/(?:viewer|gview|viewerng\/viewer)$/.test(url.pathname)
            ? url.searchParams.get("url")
            : null;
    if (inner) {
      const unwrapped = new URL(inner, url);
      if (
        /^(?:https?|file):$/.test(unwrapped.protocol) &&
        !unwrapped.username &&
        !unwrapped.password
      )
        return googleExportUrl(unwrapped.href) ?? unwrapped.href;
    }
    return DOCUMENT_MIMES[documentExtension(url.href)] ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export interface DocumentHint {
  readonly url: string;
  readonly name: string;
  readonly rank: number;
  readonly explicit: boolean;
  readonly originUrl?: string;
}

/** executeScript-safe. Bounded main-region links, embeds and LMS adapters, adapted from v1. */
export function discoverLinks(doc?: Document, win?: Window): DocumentHint[] {
  const d = doc ?? document;
  const w = win ?? window;
  const base = new URL(w.location.href);
  const result: DocumentHint[] = [];
  const add = (raw: string | null, name: string, rank: number, explicit = false, frame = false) => {
    try {
      const url = new URL(raw ?? "", base);
      if (!raw || !/^https?:$/.test(url.protocol) || url.username || url.password) return;
      result.push({
        url: url.href,
        name: name.trim().slice(0, 255),
        rank,
        explicit,
        ...(frame || (w.top && w.top !== w) ? { originUrl: frame ? url.href : base.href } : {}),
      });
    } catch {
      /* Malformed publisher links are ignored. */
    }
  };
  const root = d.querySelector('#region-main, [role="main"], main') ?? d.body;
  if (!root) return [];
  for (const node of [...root.querySelectorAll("embed[src], object[data], iframe[src]")].slice(
    0,
    20,
  ))
    add(
      node.getAttribute(node.tagName === "OBJECT" ? "data" : "src"),
      "",
      1,
      /pdf|officedocument|msword|ms-excel|ms-powerpoint/.test(node.getAttribute("type") ?? ""),
      node.tagName === "IFRAME",
    );
  const canvas = /^(\/courses\/\d+)?\/files\/(\d+)(?:\/(?:preview|download))?\/?$/.exec(
    base.pathname,
  );
  if (canvas)
    add(`${base.origin}${canvas[1] ?? ""}/files/${canvas[2]}/download?download_frd=1`, "", 2, true);
  const moodle = /\/mod\/resource\/view\.php$/.test(base.pathname) && base.searchParams.has("id");
  if (
    moodle &&
    !root.querySelector(
      '[href*="/pluginfile.php/"], [data*="/pluginfile.php/"], [src*="/pluginfile.php/"]',
    )
  ) {
    const url = new URL(base);
    url.searchParams.set("redirect", "1");
    add(url.href, "", 2, true);
  }
  if (
    /^\/webapps\/blackboard\/execute\/content\/file$/.test(base.pathname) &&
    base.searchParams.has("content_id")
  )
    add(base.href, "", 2, true);
  const d2l = /^\/d2l\/le\/content\/(\d+)\/viewContent\/(\d+)\/View/i.exec(base.pathname);
  if (d2l)
    add(
      `${base.origin}/d2l/le/content/${d2l[1]}/topics/files/download/${d2l[2]}/DirectFileTopicDownload`,
      "",
      2,
      true,
    );
  for (const anchor of [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].slice(0, 400)) {
    if (
      anchor.closest(
        'nav, aside, [role="navigation"], [role="banner"], [role="contentinfo"], .navbar, .breadcrumb, .drawer, .sidebar',
      )
    )
      continue;
    if (
      anchor.closest("header, footer") &&
      !anchor.closest("article, [role=article], [data-region=post]")
    )
      continue;
    const raw = anchor.getAttribute("href") ?? "";
    if (!raw || raw.startsWith("#")) continue;
    const hints = [
      anchor.textContent ?? "",
      anchor.title,
      anchor.getAttribute("aria-label") ?? "",
      anchor.download,
    ];
    const name =
      hints.find((hint) => /\.(pdf|docx?|pptx?|xlsx?|od[pts]|rtf|txt|md|epub)\s*$/i.test(hint)) ??
      "";
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (/\.(png|jpe?g|gif|svg|webp|zip|exe)(?:$)/i.test(url.pathname)) continue;
    let path = url.pathname;
    try {
      path = decodeURI(path);
    } catch {
      /* Malformed escapes keep their literal path. */
    }
    const docPath = /\.(pdf|docx?|pptx?|xlsx?|od[pts]|rtf|txt|md|epub)$/i.test(path);
    if (url.pathname.includes("/pluginfile.php/") && !docPath && !name) continue;
    const explicit =
      !!name ||
      anchor.hasAttribute("download") ||
      url.searchParams.get("forcedownload") === "1" ||
      /\/files\/\d+\/download\b/.test(url.pathname);
    if (/\/mod\/resource\/view\.php$/.test(url.pathname) && name)
      url.searchParams.set("redirect", "1");
    add(url.href, name, docPath || name ? 3 : 4, explicit);
  }
  add(base.href, "", 0);
  try {
    for (const entry of w.performance.getEntriesByType("resource").slice(-500))
      if (/\.(pdf|docx?|pptx?|xlsx?|od[pts]|rtf|txt|md|epub)(?:[?#]|$)/i.test(entry.name))
        add(entry.name, "", 5);
  } catch {
    /* Timing API may be restricted. */
  }
  return result.sort((a, b) => a.rank - b.rank).slice(0, 420);
}

export function selectDocuments(hints: readonly DocumentHint[], tabUrl: string): DocumentHint[] {
  const direct = resolveDocumentUrl(tabUrl);
  const candidates = [
    ...(direct ? [{ url: direct, name: "", rank: 0, explicit: true }] : []),
    ...hints,
  ];
  const seen = new Set<string>();
  return candidates
    .flatMap((hint) => {
      const url = resolveDocumentUrl(hint.url, tabUrl) ?? (hint.explicit ? hint.url : undefined);
      if (!url) return [];
      const key = url.split("#")[0]!;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ ...hint, url }];
    })
    .slice(0, 10);
}

export interface PdfViewer {
  readonly url: string;
  readonly frameUrl: string;
  readonly name: string;
  readonly memory: boolean;
}
/** MAIN-world probe; no bytes are read until the worker approves the frame URL. */
export function probePdfViewer(win?: Window): PdfViewer | null {
  try {
    const w = win ?? window;
    const app = (
      w as Window & {
        PDFViewerApplication?: {
          url?: string;
          baseUrl?: string;
          _contentDispositionFilename?: string;
          _title?: string;
          pdfDocument?: { getData?: unknown };
        };
      }
    ).PDFViewerApplication;
    if (!app) return null;
    const url = String(app.url || app.baseUrl || "");
    const memory =
      !/^https?:/i.test(url) &&
      (!url || /^(blob:|data:)/i.test(url)) &&
      typeof app.pdfDocument?.getData === "function";
    if (!memory && !/^https?:/i.test(url)) return null;
    return {
      url,
      frameUrl: w.location.href,
      name: String(
        app._contentDispositionFilename || app._title || w.document.title || "document.pdf",
      ),
      memory,
    };
  } catch {
    return null;
  }
}

/** Bounded JSON chunks avoid copying a whole PDF through executeScript in one result. */
export async function readPdfChunk(offset: number, maxBytes: number, expectedUrl: string) {
  if (location.href !== expectedUrl) throw new Error("Viewer navigated");
  const app = (
    window as Window & {
      PDFViewerApplication?: {
        pdfDocument?: { getData(): Promise<Uint8Array> };
      };
    }
  ).PDFViewerApplication;
  const bytes = await app?.pdfDocument?.getData();
  if (
    !bytes?.length ||
    bytes.length > maxBytes ||
    location.href !== expectedUrl ||
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
  )
    throw new Error("Invalid PDF bytes");
  const end = Math.min(bytes.length, offset + 192 * 1024);
  let binary = "";
  for (let at = offset; at < end; at += 8192)
    binary += String.fromCharCode(...bytes.subarray(at, Math.min(end, at + 8192)));
  return { size: bytes.length, data: btoa(binary) };
}
