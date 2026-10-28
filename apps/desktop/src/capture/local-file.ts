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

/** Normalize DOS extended paths; unmapped NT volumes and network shares are never guessed. */
export function normalizeCapturePath(path: string): string | undefined {
  const value = path.replace(/^\\\\\?\\(?=[a-z]:\\)/i, "");
  if (/^(?:\\Device\\|\\\\|\\\?\\|\\\?\?\\)/i.test(value) || /[\u0000-\u001f]/.test(value))
    return undefined;
  if (/^[a-z]:[\\/]/i.test(value)) {
    if (value.slice(2).includes(":")) return undefined;
    return win32.normalize(value);
  }
  return posix.isAbsolute(value) ? posix.normalize(value) : undefined;
}
export function readableLocalPath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const normalized = normalizeCapturePath(path);
  // Node's Windows namespace form supports paths beyond MAX_PATH for open/stat/reopen.
  return normalized && platform === "win32" ? win32.toNamespacedPath(normalized) : normalized;
}
/** Respect upload decoder limits, strip control characters, and always produce a nonempty name. */
export function uploadName(value: string, max = 255): string {
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, max)
      .trim() || "Captured source"
  );
}
