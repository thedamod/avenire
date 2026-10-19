import type { SubmitCaptureResult } from "@avenire/contracts";
import type { CapturePayload } from "@avenire/desktop/bridge";

export interface CaptureReceipt {
  readonly capturedAt: string;
  readonly files: SubmitCaptureResult["files"];
  readonly skipped: SubmitCaptureResult["skipped"];
  readonly blocked: CapturePayload["blocked"];
}

let receipt: CaptureReceipt | undefined;
const listeners = new Set<() => void>();

export function setCaptureReceipt(next: CaptureReceipt) {
  receipt = next;
  for (const listener of listeners) listener();
}

export function subscribeCaptureReceipt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCaptureReceipt() {
  return receipt;
}
