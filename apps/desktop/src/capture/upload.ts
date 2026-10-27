import { captureFailureReason } from "./failure.ts";
import { createHash } from "node:crypto";
import { extname } from "node:path";
import type {
  CaptureSnapshot,
  DesktopCaptureUploads,
  DesktopSetupCapture,
  FileKind,
} from "@avenire/contracts";
import { localBasename as basename, displayTitle, localPathIdentity } from "./local-file.ts";
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
  const paths = new Map(
    [...snapshot.windows, ...snapshot.media]
      .map((entry) => entry.filePath)
      .filter((path): path is string => Boolean(path))
      .map((path) => [localPathIdentity(path, snapshot.platform), path]),
  );
  const files = [...paths.values()].flatMap((path) => {
    const format = formats[extname(path).slice(1).toLowerCase()];
    return format ? [{ title: displayTitle(path), kind: format[0] }] : [];
  });
  const urls = new Set<string>();
  const tabs = snapshot.tabs.flatMap((tab) => {
    const url = tab.finalUrl ?? tab.url;
    if (urls.has(url)) return [];
    urls.add(url);
    return [
      {
        title: displayTitle(
          tab.title,
          /^file:/i.test(tab.finalUrl ?? tab.url) ? (tab.finalUrl ?? tab.url) : undefined,
        ),
        kind: tab.likelyPdf ? "pdf" : "web-page",
      },
    ];
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
/** SMTC/MPRIS can report an unknown position as NaN or a negative; only a real one is kept. */
const mediaPosition = (native: object | undefined) => {
  const seconds = native && "positionSec" in native ? native.positionSec : undefined;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? { position: { mediaSec: seconds } }
    : {};
};

export async function uploadCapturedFiles(
  snapshot: CaptureSnapshot,
  appUrl: string,
  avenireFetch: AvenireUploadFetch,
  signal?: AbortSignal,
  options?: NativeUploadOptions,
): Promise<DesktopCaptureUploads> {
  const files: DesktopCaptureUploads["files"][number][] = [];
  const skipped: DesktopCaptureUploads["skipped"][number][] = [];
  const paths = new Map(
    [
      ...snapshot.windows.map((entry) => entry.filePath),
      ...snapshot.media.map((entry) => entry.filePath),
    ]
      .filter((path): path is string => Boolean(path))
      .map((path) => [localPathIdentity(path, snapshot.platform), path]),
  );
  const gate = options?.gate ?? new UploadGate();
  await mapConcurrent([...paths.values()], 3, async (path) => {
    const key = options?.keyForPath(path) ?? path;
    const title = displayTitle(path) || "Captured source";
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
    const hex = createHash("sha256")
      .update(`${snapshot.id}\0${localPathIdentity(path, snapshot.platform)}`)
      .digest("hex")
      .slice(0, 32);
    const idempotencyKey = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const native = [...snapshot.media, ...snapshot.windows].find(
      (entry) =>
        localPathIdentity(entry.filePath ?? "", snapshot.platform) ===
        localPathIdentity(path, snapshot.platform),
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
              ...mediaPosition(native),
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
    } catch (error) {
      // Mapped to fixed wording plus server text: local error messages can contain paths.
      const reason = captureFailureReason(error);
      options?.progress(key, "failed", undefined, reason);
      skipped.push({ title, reason });
    }
  });
  return { files, skipped };
}
