import type { SourceAccess } from "@avenire/contracts";

/** Only fixed, reader-generated messages may cross the extension boundary. */
export class DocumentReadError extends Error {
  readonly access: SourceAccess | undefined;
  constructor(message: string, access?: SourceAccess) {
    super(message);
    this.access = access;
  }
}
export const driveReasons = {
  quota:
    "Google Drive won't download this file right now (too many downloads). Open it in Drive later and capture again.",
  disabled: "The owner turned off downloads for this file, so Avenire can't save a copy.",
  login: "Sign in to Google with the account that can open this file, then capture again.",
  confirm: "Google Drive asked to confirm this large download; open it in Drive and capture again.",
};
export const isDriveDownload = (raw: string): boolean => {
  const url = new URL(raw);
  return url.hostname === "drive.usercontent.google.com" && url.pathname === "/download";
};
export const isLoginRedirect = (raw: string): boolean => {
  if (!raw) return false;
  const url = new URL(raw);
  return (
    url.hostname === "accounts.google.com" &&
    /^\/(?:ServiceLogin|InteractiveLogin|v\d+\/signin|signin)(?:\/|$)/i.test(url.pathname)
  );
};
export const htmlFileReason = (raw: string): string =>
  `The site returned a web page instead of the file (you may need to sign in on ${new URL(raw).hostname})`;
export const driveHttpReason = (status: number): string =>
  `Google Drive didn't return the file (HTTP ${status}).`;

const entities = (text: string): string =>
  text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
    const key = entity.slice(1, -1).toLowerCase();
    if (named[key]) return named[key];
    const code = key.startsWith("#x") ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
// MV3 workers have no DOMParser. Parse only bounded form/anchor attributes, never execute HTML.
const attributes = (tag: string): Record<string, string> => {
  const result: Record<string, string> = Object.create(null);
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
    result[match[1]!.toLowerCase()] = entities(match[2] ?? match[3] ?? match[4] ?? "");
  return result;
};

/** The GET download-form + hidden-input flow is also used by gdown's download.py. */
function confirmationUrl(html: string, original: string, base: string): string | undefined {
  const source = new URL(original);
  let candidate: URL | undefined;
  const markup = html.replace(/<!--[^]*?-->|<script\b[^]*?<\/script\s*>/gi, "");
  for (const form of markup.matchAll(/<form\b([^>]*?)(?:>)([^]*?)<\/form\s*>/gi)) {
    const attrs = attributes(form[1]!);
    const inputs = [...form[2]!.matchAll(/<input\b[^>]*>/gi)]
      .map((input) => attributes(input[0]))
      .filter((input) => input.type?.toLowerCase() === "hidden");
    if (
      attrs.id !== "download-form" &&
      !inputs.some((input) => /^(confirm|uuid)$/.test(input.name ?? ""))
    )
      continue;
    if (attrs.method && attrs.method.toLowerCase() !== "get") continue;
    try {
      candidate = new URL(attrs.action || base, base);
      for (const input of inputs)
        if (input.name) candidate.searchParams.set(input.name, input.value ?? "");
    } catch {
      continue;
    }
    break;
  }
  if (!candidate) {
    for (const tag of markup.matchAll(/<a\b[^>]*>/gi)) {
      const attrs = attributes(tag[0]);
      if (attrs.id !== "uc-download-link" || !attrs.href) continue;
      try {
        candidate = new URL(attrs.href, base);
      } catch {
        /* Invalid confirmation link. */
      }
      break;
    }
  }
  if (!candidate || candidate.protocol !== "https:" || candidate.username || candidate.password)
    return;
  // Do not send the user's session or form tokens to an arbitrary action/other file.
  if (
    !(
      (candidate.hostname === "drive.usercontent.google.com" &&
        candidate.pathname === "/download") ||
      (["drive.google.com", "docs.google.com"].includes(candidate.hostname) &&
        candidate.pathname === "/uc")
    )
  )
    return;
  if (
    candidate.searchParams.get("id") &&
    candidate.searchParams.get("id") !== source.searchParams.get("id")
  )
    return;
  candidate.hostname = "drive.usercontent.google.com";
  candidate.pathname = "/download";
  for (const key of ["id", "authuser", "resourcekey"]) {
    const value = source.searchParams.get(key);
    if (value !== null) candidate.searchParams.set(key, value);
  }
  candidate.searchParams.set("export", "download");
  return candidate.href;
}

export const looksLikeHtml = (bytes: Uint8Array): boolean =>
  /^\s*(?:<!doctype\s+html|<html|<head|<body|<form|<\?xml[^]*?<html)/i.test(
    new TextDecoder().decode(bytes.subarray(0, 1024)),
  );

const MAX_HTML_BYTES = 256 * 1024;
export interface DocumentResponse {
  readonly url: string;
  readonly response: Response;
  readonly reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  readonly first: Uint8Array<ArrayBuffer>;
}

/** Credentialed GET probe: inspect bounded HTML; retain the stream for direct file capture.
 * Desktop callers cancel the PDF stream immediately and let Chrome stream it to disk.
 * No preview URL is synthesized: Drive preview shells/page images are not original PDF bytes.
 */
export async function documentResponse(
  original: string,
  signal: AbortSignal,
  fetcher: typeof fetch,
  permitted: (url: string) => boolean,
  allowConfirmation = true,
): Promise<DocumentResponse> {
  const drive = isDriveDownload(original);
  let url = original;
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    if (!permitted(url)) throw new Error("Document redirect blocked by capture policy");
    const response = await fetcher(url, { credentials: "include", signal });
    const finalUrl = response.url || url;
    if (isLoginRedirect(finalUrl)) {
      await response.body?.cancel();
      throw new DocumentReadError(
        drive
          ? driveReasons.login
          : `Sign in on ${new URL(original).hostname}, then capture again.`,
        "login-required",
      );
    }
    if (!permitted(finalUrl)) {
      await response.body?.cancel();
      throw new Error("Document redirect blocked by capture policy");
    }
    const reader = response.body?.getReader();
    let first: Uint8Array<ArrayBuffer>;
    try {
      first = (await reader?.read())?.value ?? new Uint8Array();
    } catch (error) {
      try {
        await reader?.cancel();
      } finally {
        reader?.releaseLock();
      }
      throw error;
    }
    const mime = response.headers.get("content-type") ?? "";
    if (response.ok && !/html|xhtml/i.test(mime) && !looksLikeHtml(first)) {
      if (!reader) throw new Error("Document response has no body");
      return { url: finalUrl, response, reader, first };
    }
    let html = "";
    if (reader) {
      try {
        const decoder = new TextDecoder();
        let size = 0;
        let chunk: Uint8Array = first;
        while (size < MAX_HTML_BYTES) {
          const part = chunk.subarray(0, MAX_HTML_BYTES - size);
          html += decoder.decode(part, { stream: true });
          size += part.length;
          if (size >= MAX_HTML_BYTES) break;
          const next = await reader.read();
          if (next.done) break;
          chunk = next.value;
        }
        html += decoder.decode();
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
    }
    if (drive) {
      const text = entities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
      if (/too many users have viewed or downloaded this file recently|download quota/i.test(text))
        throw new DocumentReadError(driveReasons.quota);
      if (
        /(?:owner|download(?:ing)?)[^.]{0,120}(?:disabled|turned off|not allowed)|(?:disabled|turned off)[^.]{0,100}download|do(?:es)? not have permission to download|cannot download this file because[^.]*owner/i.test(
          text,
        )
      )
        throw new DocumentReadError(driveReasons.disabled);
      const confirmation = confirmationUrl(html, original, finalUrl);
      if (confirmation && allowConfirmation && attempt === 0) {
        url = confirmation;
        continue;
      }
      if (
        /download-form|uc-download-link|name\s*=\s*["']?(?:confirm|uuid)\b|can't scan this file for viruses|cannot scan this file for viruses/i.test(
          html,
        )
      )
        throw new DocumentReadError(driveReasons.confirm);
      if (
        /switch accounts|sign in with (?:a different|another) account|you need access/i.test(text)
      )
        throw new DocumentReadError(driveReasons.login);
      throw new DocumentReadError(driveHttpReason(response.status));
    }
    if (/html|xhtml/i.test(mime) || looksLikeHtml(first))
      throw new DocumentReadError(htmlFileReason(original));
    throw new DocumentReadError(`The site didn't return the file (HTTP ${response.status}).`);
  }
}

export function downloadInterruptedReason(reason = ""): string {
  if (reason === "SERVER_FORBIDDEN")
    return "The site refused the download. Open the file on the site and capture again.";
  if (reason === "SERVER_UNAUTHORIZED")
    return "The site didn't authorize the download. Check your account on the site and capture again.";
  if (reason.startsWith("NETWORK_"))
    return "The download stopped because of a network problem. Check your connection and capture again.";
  if (reason === "FILE_TOO_LARGE")
    return "The browser couldn't save this file because it is too large.";
  if (reason === "USER_CANCELED") return "The download was canceled. Capture again to retry.";
  if (reason.startsWith("FILE_"))
    return "The browser couldn't save the downloaded file. Check file access and free disk space, then capture again.";
  return "The browser couldn't download the file. Open it on the site and capture again.";
}
