import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type {
  CaptureSnapshot,
  DesktopCaptureUploads,
  DesktopSetupCapture,
  FileKind,
} from "@avenire/contracts";
import { hostname } from "node:os";
import { HashLru, mapConcurrent, UploadGate } from "./hash-cache.ts";
import type { LocalOriginRegistry } from "./registry.ts";
import { acquireAndUploadSource, type AvenireUploadFetch } from "./source-acquisition.ts";

export const formats: Record<string, readonly [FileKind, string]> = {
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

const hashCache = new HashLru();
export interface NativeUploadOptions {
  readonly owner: string;
  readonly registry: LocalOriginRegistry;
  readonly gate: UploadGate;
  readonly progress: (
    key: string,
    status: "uploading" | "saved" | "skipped" | "failed",
    file?: DesktopCaptureUploads["files"][number],
    reason?: string,
  ) => void;
  readonly keyForPath: (path: string) => string;
}

/** Only accepts paths produced by policy-filtered native collectors, never renderer input. */
export async function uploadCapturedFiles(
  snapshot: CaptureSnapshot,
  appUrl: string,
  avenireFetch: AvenireUploadFetch,
  signal?: AbortSignal,
  options?: NativeUploadOptions,
): Promise<DesktopCaptureUploads> {
  const files: DesktopCaptureUploads["files"][number][] = [];
  const skipped: DesktopCaptureUploads["skipped"][number][] = [];
  const paths = new Set(
    [
      ...snapshot.windows.map((entry) => entry.filePath),
      ...snapshot.media.map((entry) => entry.filePath),
    ].filter((path): path is string => Boolean(path)),
  );
  const gate = options?.gate ?? new UploadGate();
  await mapConcurrent([...paths], 3, async (path) => {
    const key = options?.keyForPath(path) ?? path;
    const title = basename(path).slice(0, 200) || "Captured source";
    const format = formats[extname(path).slice(1).toLowerCase()];
    if (!format) {
      skipped.push({ title, reason: "This file type is not supported by server ingestion yet." });
      options?.progress(
        key,
        "skipped",
        undefined,
        "This file type is not supported by server ingestion yet.",
      );
      return;
    }
    const hex = createHash("sha256").update(`${snapshot.id}\0${path}`).digest("hex").slice(0, 32);
    const idempotencyKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const native = [...snapshot.windows, ...snapshot.media].find(
      (entry) => entry.filePath === path,
    );
    try {
      const file = await gate.run(async () => {
        signal?.throwIfAborted();
        options?.progress(key, "uploading");
        return acquireAndUploadSource(
          { type: "local-file", path },
          { idempotencyKey, title, kind: format[0], mimeType: format[1] },
          {
            appUrl,
            avenireFetch,
            hashCache,
            ...(signal ? { signal } : {}),
            localOrigin: {
              _tag: "LocalFile",
              deviceId: snapshot.deviceId,
              deviceName: hostname(),
              platform: snapshot.platform,
              fileName: basename(path).slice(0, 255),
              capturedAt: snapshot.capturedAt,
              ...(native?.appName ? { appName: native.appName.slice(0, 255) } : {}),
              ...("positionSec" in (native ?? {})
                ? { position: { mediaSec: (native as { positionSec: number }).positionSec } }
                : {}),
            },
            ...(options
              ? {
                  onLocalUploaded: (file, origin) =>
                    options.registry.record(options.owner, file.id, origin),
                }
              : {}),
          },
        );
      });
      files.push(file);
      options?.progress(key, "saved", file);
    } catch {
      options?.progress(
        key,
        "failed",
        undefined,
        "Could not upload this file. Check your connection, sign-in and file access, then capture again.",
      );
      // Infrastructure errors can contain local paths; give the renderer an actionable summary.
      skipped.push({
        title,
        reason:
          "Could not upload this file. Check your connection, sign-in and file access, then capture again.",
      });
    }
  });
  return { files, skipped };
}
