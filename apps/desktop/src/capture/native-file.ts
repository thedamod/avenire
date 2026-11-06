import { extname } from "node:path";
import { isLocalFileApp } from "./support/app-catalog.ts";
import { normalizeCapturePath, localBasename } from "./local-file.ts";
import { formats } from "./upload.ts";

/** Called at the collector boundary, before any native window can reach a capture row. */
export function nativeFile(appName: string, path: string | undefined): string | undefined {
  if (!path || !isLocalFileApp(appName)) return undefined;
  const normalized = normalizeCapturePath(path);
  if (!normalized || localBasename(normalized).startsWith("~$")) return undefined;
  const ext = extname(normalized).slice(1).toLowerCase();
  if (/^notepad\+\+(?:\.exe)?$/i.test(appName) && !["md", "txt"].includes(ext)) return undefined;
  return formats[ext] ? normalized : undefined;
}
