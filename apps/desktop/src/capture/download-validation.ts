import { realpath, stat, open } from "node:fs/promises";
import { join, relative, isAbsolute, dirname, basename } from "node:path";
import { MAX_SOURCE_UPLOAD_BYTES, type PageSnapshot } from "@avenire/contracts";
import { validLocalPath } from "./reopen.ts";
import { readableLocalPath, normalizeCapturePath } from "./local-file.ts";

export interface DownloadWindow {
  readonly captureId: string;
  readonly startedAt: number;
  readonly endedAt: number;
}
/** Caller proves authenticated peer + live pending request + requested tab before calling. */
export async function validateBrowserDownload(
  download: NonNullable<PageSnapshot["download"]>,
  downloadsRoot: string,
  window: DownloadWindow,
): Promise<string> {
  if (
    !/^[a-zA-Z0-9_-]{1,200}$/.test(window.captureId) ||
    download.captureId !== window.captureId ||
    !validLocalPath(download.path) ||
    !isAbsolute(download.path)
  )
    throw new Error("Browser download path is invalid");
  if (
    !Number.isSafeInteger(download.sizeBytes) ||
    download.sizeBytes < 1 ||
    download.sizeBytes > MAX_SOURCE_UPLOAD_BYTES
  )
    throw new Error("Capture file limit exceeded; document skipped");
  const expected = join(downloadsRoot, "Avenire", window.captureId);
  const inside = (base: string, path: string) => {
    const rel = relative(base, path);
    return (
      !!rel && !rel.startsWith("..") && !isAbsolute(rel) && relative(base, dirname(path)) === ""
    );
  };
  if (!inside(expected, download.path))
    throw new Error("Browser download is outside Avenire capture directory");
  const path = normalizeCapturePath(
    await realpath(readableLocalPath(download.path) ?? download.path),
  );
  if (!path) throw new Error("Browser download path is invalid");
  const root = normalizeCapturePath(
    await realpath(readableLocalPath(downloadsRoot) ?? downloadsRoot),
  );
  if (!root) throw new Error("Browser download directory is invalid");
  const canonicalExpected = join(root, "Avenire", window.captureId);
  // Both spellings must stay in the actual Downloads/Avenire/id directory. Symlink escapes fail.
  if (!validLocalPath(path) || !inside(canonicalExpected, path) || basename(path).startsWith("~$"))
    throw new Error("Browser download symlink escapes Avenire capture directory");
  const info = await stat(readableLocalPath(path) ?? path);
  if (!info.isFile()) throw new Error("Browser download is not a regular file");
  if (info.size !== download.sizeBytes) throw new Error("Browser download size mismatch");
  if (info.mtimeMs < window.startedAt || info.mtimeMs > window.endedAt)
    throw new Error("Browser download was modified outside capture window");
  // Chrome can report a completed .pdf whose body is actually an HTML error page.
  // Read a prefix only, even for a 256 MiB original, before handing it to the uploader.
  const file = await open(readableLocalPath(path) ?? path, "r");
  try {
    const head = Buffer.alloc(1024);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    if (
      /^\s*(?:<!doctype\s+html|<html|<head|<body|<form)/i.test(head.toString("utf8", 0, bytesRead))
    )
      throw new Error(
        `The site returned a web page instead of the file (you may need to sign in on ${new URL(download.url).hostname})`,
      );
  } finally {
    await file.close();
  }
  return path;
}
