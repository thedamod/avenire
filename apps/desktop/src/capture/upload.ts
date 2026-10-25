import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type {
  CaptureSnapshot,
  DesktopCaptureUploads,
  DesktopSetupCapture,
  FileKind,
} from "@avenire/contracts";
import { acquireAndUploadSource, type AvenireUploadFetch } from "./source-acquisition.ts";

const formats: Record<string, readonly [FileKind, string]> = {
  pdf: ["pdf", "application/pdf"],
  docx: ["document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pptx: ["document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  xlsx: ["document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  txt: ["note", "text/plain"],
  md: ["note", "text/markdown"],
  markdown: ["note", "text/markdown"],
  tex: ["note", "text/plain"],
  doc: ["document", "application/msword"],
  ppt: ["document", "application/vnd.ms-powerpoint"],
  xls: ["document", "application/vnd.ms-excel"],
  rtf: ["document", "application/rtf"],
  mp3: ["audio", "audio/mpeg"],
  m4a: ["audio", "audio/mp4"],
  wav: ["audio", "audio/wav"],
  ogg: ["audio", "audio/ogg"],
  oga: ["audio", "audio/ogg"],
  opus: ["audio", "audio/ogg"],
  flac: ["audio", "audio/flac"],
  aac: ["audio", "audio/aac"],
  mp4: ["video", "video/mp4"],
  m4v: ["video", "video/mp4"],
  webm: ["video", "video/webm"],
  mov: ["video", "video/quicktime"],
  mkv: ["video", "video/x-matroska"],
};

/** Mirrors the sources that can actually enter ingestion; never includes absolute device paths. */
export function describeCapturedSources(snapshot: CaptureSnapshot): DesktopSetupCapture["sources"] {
  const paths = new Set(
    [...snapshot.windows, ...snapshot.media]
      .map((entry) => entry.filePath)
      .filter((path): path is string => Boolean(path)),
  );
  const files = [...paths].flatMap((path) => {
    const format = formats[extname(path).slice(1).toLowerCase()];
    return format ? [{ title: basename(path).slice(0, 200), kind: format[0] }] : [];
  });
  const urls = new Set<string>();
  const tabs = snapshot.tabs.flatMap((tab) => {
    const url = tab.finalUrl ?? tab.url;
    if (urls.has(url)) return [];
    urls.add(url);
    return [{ title: tab.title.slice(0, 200), kind: tab.likelyPdf ? "pdf" : "web-page" }];
  });
  return [...files, ...tabs];
}

/** Only accepts paths produced by policy-filtered native collectors, never renderer input. */
export async function uploadCapturedFiles(
  snapshot: CaptureSnapshot,
  appUrl: string,
  avenireFetch: AvenireUploadFetch,
  signal?: AbortSignal,
): Promise<DesktopCaptureUploads> {
  const files: DesktopCaptureUploads["files"][number][] = [];
  const skipped: DesktopCaptureUploads["skipped"][number][] = [];
  const paths = new Set(
    [
      ...snapshot.windows.map((entry) => entry.filePath),
      ...snapshot.media.map((entry) => entry.filePath),
    ].filter((path): path is string => Boolean(path)),
  );
  // Serial uploads bound disk/network pressure. Original bytes enter the existing upload queue.
  for (const path of paths) {
    const title = basename(path).slice(0, 200) || "Captured source";
    const format = formats[extname(path).slice(1).toLowerCase()];
    if (!format) {
      skipped.push({ title, reason: "This file type is not supported by server ingestion yet." });
      continue;
    }
    const hex = createHash("sha256").update(`${snapshot.id}\0${path}`).digest("hex").slice(0, 32);
    const idempotencyKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    try {
      files.push(
        await acquireAndUploadSource(
          { type: "local-file", path },
          { idempotencyKey, title, kind: format[0], mimeType: format[1] },
          { appUrl, avenireFetch, ...(signal ? { signal } : {}) },
        ),
      );
    } catch {
      // Infrastructure errors can contain local paths; give the renderer an actionable summary.
      skipped.push({
        title,
        reason:
          "Could not upload this file. Check your connection, sign-in and file access, then capture again.",
      });
    }
  }
  return { files, skipped };
}
