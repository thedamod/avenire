import type { UploadRejected } from "./source-acquisition.ts";

// Matched by tag and name rather than instanceof, so the check survives module mocks and bundling.
const causeOf = (error: unknown): unknown =>
  (error as { _tag?: unknown } | null)?._tag === "DeviceAcquisitionError"
    ? (error as { cause: unknown }).cause
    : error;
const isRejection = (value: unknown): value is UploadRejected =>
  value instanceof Error && value.name === "UploadRejected";

/**
 * What the capture overlay says when a source couldn't be saved. Server text is safe to show
 * (the server never sees device paths); local errors are reduced to their kind.
 */
export function captureFailureReason(error: unknown): string {
  const cause = causeOf(error);
  if (isRejection(cause)) {
    const detail = cause.detail ? ` (${cause.detail})` : "";
    if (cause.status === 401 || cause.status === 403)
      return "Avenire needs you to sign in again, then capture again.";
    if (cause.status === 413) return "This file is larger than Avenire's 256 MB limit.";
    if (cause.status === 400 || cause.status === 415 || cause.status === 422)
      return `Avenire couldn't accept this file${detail}. If you just updated the desktop app, update and restart the Avenire server too.`;
    if (cause.status >= 500)
      return `Avenire's server had a problem (HTTP ${cause.status}). Try again.`;
    return `Avenire rejected this file (HTTP ${cause.status})${detail}.`;
  }
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return "The file moved or was deleted before it could be read.";
  if (code === "EACCES" || code === "EPERM" || code === "EBUSY")
    return "Couldn't read this file: another app has it locked, or access was denied.";
  const message = cause instanceof Error ? cause.message : "";
  if (/byte limit|exceeds/i.test(message))
    return "This file is larger than Avenire's 256 MB limit.";
  if (/deadline|aborted|timed? ?out/i.test(message))
    return "Saving this file took too long. Capture again.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(message))
    return "Couldn't reach Avenire. Check that it's running, then capture again.";
  return "Could not save this file. Capture again; if it keeps failing, restart Avenire.";
}
