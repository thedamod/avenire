import { fileURLToPath } from "node:url";
import { win32, posix } from "node:path";

/** Explicit platform support also makes Windows file URL handling testable on Linux. */
export function localFilePath(url: string, platform: NodeJS.Platform = process.platform): string {
  return fileURLToPath(url, { windows: platform === "win32" });
}
export function localBasename(path: string): string {
  return win32.basename(posix.basename(path));
}
