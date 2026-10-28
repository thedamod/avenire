import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { localBasename } from "./local-file.ts";

/** One scrubber for UI errors, stacks and log fields. No file contents are passed here. */
export function scrubCaptureText(value: string): string {
  return value
    .replace(/(?:https?):\/\/[^\s"'<>]+/gi, "[url]")
    .replace(
      /(?:file:\/\/)?(?:[a-z]:[\\/]|\\\\|\\Device\\|\/)[^\r\n"'<>]*?(?=["'<>\r\n]|$)/gi,
      (path) => {
        // Stack frames may end in a closing parenthesis; retain it outside the basename.
        const suffix = path.endsWith(")") ? ")" : "";
        return localBasename(path.slice(0, path.length - suffix.length).trim()) + suffix;
      },
    );
}
export function captureError(error: unknown): Record<string, string> {
  const cause =
    (error as { _tag?: string; cause?: unknown } | null)?._tag === "DeviceAcquisitionError"
      ? (error as { cause: unknown }).cause
      : error;
  const e = cause as { name?: unknown; code?: unknown; message?: unknown; stack?: unknown } | null;
  return Object.fromEntries(
    Object.entries({
      name: typeof e?.name === "string" ? e.name : "Error",
      code: typeof e?.code === "string" ? e.code : "",
      message: typeof e?.message === "string" ? e.message : String(cause),
      stack: typeof e?.stack === "string" ? e.stack : "",
    }).map(([key, value]) => [key, scrubCaptureText(value)]),
  );
}
let logPath: string | undefined;
export const captureLogPath = () => logPath;
export function initializeCaptureLog(directory: string): string {
  mkdirSync(directory, { recursive: true });
  logPath = join(directory, "capture.log");
  if (!existsSync(logPath)) writeFileSync(logPath, "", { mode: 0o600 });
  return logPath;
}
/** Three files total, each at most 1 MiB. Synchronous bounded writes preserve rotation order. */
export function captureLog(stage: string, details: Record<string, unknown> = {}): void {
  if (!logPath) return;
  try {
    const line =
      JSON.stringify({ at: new Date().toISOString(), stage, ...details }, (_key, value: unknown) =>
        typeof value === "string" ? scrubCaptureText(value) : value,
      ).slice(0, 32_000) + "\n";
    if (statSync(logPath).size + Buffer.byteLength(line) > 1024 * 1024) {
      rmSync(`${logPath}.2`, { force: true });
      if (existsSync(`${logPath}.1`)) renameSync(`${logPath}.1`, `${logPath}.2`);
      renameSync(logPath, `${logPath}.1`);
    }
    appendFileSync(logPath, line, { mode: 0o600 });
  } catch {
    /* A full/unwritable log volume must not prevent capture. */
  }
}
