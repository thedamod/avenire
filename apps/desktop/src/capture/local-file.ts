import { fileURLToPath } from "node:url";
import { win32, posix } from "node:path";

/** Explicit platform support also makes Windows file URL handling testable on Linux. */
export function localFilePath(url: string, platform: NodeJS.Platform = process.platform): string {
  return fileURLToPath(url, { windows: platform === "win32" });
}
export function localBasename(path: string): string {
  return win32.basename(posix.basename(path));
}

/** Identity only: retain the original path for reads and reopening. */
export function localPathIdentity(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") return win32.normalize(path).toLowerCase();
  return platform === "darwin" ? path.toLowerCase() : path;
}

/** All device-facing source titles use the same path redaction. */
export function displayTitle(title: string, path?: string): string {
  let value = path || title;
  if (/^file:/i.test(value)) {
    try {
      value = localFilePath(value, /\/\w:/.test(value) ? "win32" : "linux");
    } catch {
      return "Captured source";
    }
  }
  return (
    (path || /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(value) ? localBasename(value) : value).slice(
      0,
      200,
    ) || "Captured source"
  );
}
