import type { BlockedCategory, CaptureSnapshot } from "@avenire/contracts";

/** What the main process sends after a capture: the policy-filtered snapshot plus what was dropped. */
export interface CapturePayload {
  readonly snapshot: CaptureSnapshot;
  readonly blocked: ReadonlyArray<{ readonly title: string; readonly category: BlockedCategory }>;
}

/** Exposed on `window.avenire` in the desktop shell; absent in a normal browser. */
export interface AvenireDesktopBridge {
  readonly platform: NodeJS.Platform;
  readonly onCapture: (callback: (payload: CapturePayload) => void) => () => void;
  readonly captureNow: () => Promise<void>;
  readonly setCaptureShortcut: (accelerator: string) => Promise<boolean>;
}
