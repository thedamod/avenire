/**
 * Decides how a source is extracted from its bytes, MIME type and URL. File
 * signatures win over the declared type, so a capture labelled "note" that is
 * really an MP4 still goes down the media path (v1 routed those to Markdown).
 */
import type { SourceInput } from "./types.ts";

export type SourceFormat =
  | "pdf"
  | "office"
  | "image"
  | "media"
  | "captions"
  | "text"
  | "html"
  | "youtube"
  | "web";

const OFFICE_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

/** `"Application/PDF; charset=x"` -> `"application/pdf"`. */
export const mimeEssence = (mimeType: string | null): string | undefined =>
  mimeType?.split(";")[0]?.trim().toLowerCase() || undefined;

export const isOfficeMime = (mimeType: string | null): boolean => {
  const mime = mimeEssence(mimeType);
  return mime !== undefined && OFFICE_TYPES.has(mime);
};

export const isYouTubeUrl = (url: string | null): boolean =>
  url !== null && /(?:^|\.)(?:youtube\.com|youtu\.be)\//i.test(url.replace(/^https?:\/\//i, ""));

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** The format a file's leading bytes identify, when they identify one. */
export const sniff = (bytes: Uint8Array): "pdf" | "image" | "media" | "zip" | undefined => {
  if (startsWith(bytes, ascii("%PDF-"))) return "pdf";
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) ||
    startsWith(bytes, [0xff, 0xd8, 0xff]) ||
    startsWith(bytes, ascii("GIF8")) ||
    (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
  ) {
    return "image";
  }
  if (
    startsWith(bytes, ascii("ftyp"), 4) || // MP4, M4A, MOV
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) || // WebM, Matroska
    startsWith(bytes, ascii("ID3")) ||
    startsWith(bytes, [0xff, 0xfb]) || // MP3 frame
    startsWith(bytes, ascii("OggS")) ||
    startsWith(bytes, ascii("fLaC")) ||
    (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WAVE"), 8))
  ) {
    return "media";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  return undefined;
};

export const resolveFormat = (source: SourceInput): SourceFormat | undefined => {
  const mime = mimeEssence(source.mimeType);
  if (source.bytes !== null) {
    const sniffed = sniff(source.bytes);
    if (sniffed === "zip") return isOfficeMime(mime ?? null) ? "office" : undefined;
    if (sniffed !== undefined) return sniffed;
    if (mime === "text/vtt" || mime === "application/x-subrip") return "captions";
    const head = new TextDecoder().decode(source.bytes.subarray(0, 256)).replace(/^\uFEFF/, "");
    if (/^WEBVTT(?:\s|$)/.test(head) || /^\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(head))
      return "captions";
    if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
    if (
      mime?.startsWith("text/") ||
      mime === "application/json" ||
      source.kind === "note" ||
      source.kind === "selection"
    ) {
      return "text";
    }
    return undefined;
  }
  if (source.sourceUrl === null) return undefined;
  if (isYouTubeUrl(source.sourceUrl)) return "youtube";
  return source.kind === "web-page" ? "web" : undefined;
};
