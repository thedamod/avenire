import type { OverlayState, OverlayAnnotation, PromptCaptureContext } from "./native-overlay.ts";
import type {
  BlockedCategory,
  DesktopNativeScene,
  DesktopNativeDiagram,
  DesktopNativeObservation,
  CaptureSnapshot,
  DesktopCaptureUploads,
  DesktopPermission,
  DesktopSetupChoice,
  DesktopSetupStatus,
  DesktopShortcuts,
  DesktopSetupCapture,
  UserSettingsPatch,
  DesktopWindowChrome,
  DesktopWindowTheme,
  LibraryFile,
  ReopenPlan,
} from "@avenire/contracts";

/** What the main process sends after a capture: the policy-filtered snapshot plus what was dropped. */
export interface CapturePayload {
  readonly snapshot: CaptureSnapshot;
  readonly blocked: ReadonlyArray<{ readonly title: string; readonly category: BlockedCategory }>;
  readonly uploads?: DesktopCaptureUploads;
}

export interface CaptureStarted {
  readonly id: string;
  readonly items: ReadonlyArray<{
    readonly key: string;
    readonly title: string;
    readonly kind: string;
    readonly status: "pending";
  }>;
}
export interface CaptureProgress {
  readonly stage?: "preparing" | "transferring" | "validating";
  readonly loadedBytes?: number;
  readonly totalBytes?: number;
  readonly id: string;
  readonly seq: number;
  readonly key: string;
  readonly title?: string;
  readonly kind?: string;
  readonly status: "pending" | "uploading" | "saved" | "skipped" | "failed";
  readonly file?: LibraryFile;
  readonly reason?: string;
}
export interface ReopenResult {
  readonly ok: boolean;
  /** `other-device`: captured on another computer, so only the library copy can open here. */
  readonly note?: "changed-since-capture" | "missing" | "other-device";
}

export interface CaptureReceiptSummary {
  readonly files: readonly LibraryFile[];
  readonly skipped: ReadonlyArray<{ readonly title: string; readonly reason: string }>;
  readonly blocked: ReadonlyArray<{ readonly title: string; readonly category: BlockedCategory }>;
}

/**
 * Everything the global capture overlay renders. Main owns it: started/progress events fill
 * `items`, then the app window's receipt (or failure) moves `phase` to done/failed.
 */
export const CAPTURE_TOAST_VISIBLE_MS = 3500;

export interface CaptureOverlayState {
  readonly undoneFileIds?: readonly string[];
  readonly maxHeight?: number;
  readonly id: string;
  readonly phase: "collecting" | "submitting" | "done" | "failed";
  readonly closing?: boolean;
  readonly items: ReadonlyArray<Omit<CaptureProgress, "id" | "seq"> & { readonly title: string }>;
  readonly receipt?: CaptureReceiptSummary;
  readonly error?: string;
  /** The capture accelerator, for the keycaps in the header. */
  readonly shortcut?: string;
}

/** Exposed on `window.avenireOverlay` in the bundled, always-on-top capture overlay only. */
export interface AvenireOverlayBridge {
  readonly platform: NodeJS.Platform;
  readonly onState: (callback: (state: CaptureOverlayState) => void) => () => void;
  /** Trash one saved file through the capture owner's authenticated session. */
  readonly undo: (captureId: string, fileId: string) => Promise<void>;
  /** Reopen a saved file through the desktop reopen executor, else show it in Avenire. */
  readonly open: (fileId: string) => Promise<void>;
  readonly openSources: () => Promise<void>;
  /** While hovered, main keeps the overlay up and lets it take clicks. */
  readonly setHovered: (hovered: boolean) => Promise<void>;
  /** The overlay finished its exit animation; main hides the window. */
  readonly dismissed: (captureId: string) => Promise<void>;
  /** Content height in CSS px; main resizes the window and keeps it anchored bottom-right. */
  readonly resize: (height: number) => Promise<void>;
}

/** What the overlay asks the signed-in app window to do on its behalf. */
export type CaptureOverlayAction = {
  readonly type: "undo" | "undone";
  readonly captureId: string;
  readonly fileIds: readonly string[];
};

/** Exposed on `window.avenire` in the desktop shell; absent in a normal browser. */
export interface AvenireWindowBridge {
  readonly getWindowChrome: () => Promise<DesktopWindowChrome | null>;
  readonly setWindowTheme: (theme: DesktopWindowTheme) => Promise<void>;
}

export interface AvenireDesktopBridge extends AvenireWindowBridge {
  readonly platform: NodeJS.Platform;
  readonly onCapture: (callback: (payload: CapturePayload) => void) => () => void;
  readonly onCaptureStarted: (callback: (payload: CaptureStarted) => void) => () => void;
  readonly onCaptureProgress: (callback: (payload: CaptureProgress) => void) => () => void;
  readonly reopen: (fileId: string, plan?: ReopenPlan) => Promise<ReopenResult>;
  readonly extensionConnected: () => Promise<boolean>;
  readonly captureNow: () => Promise<void>;
  readonly setCaptureReady: (
    ready: boolean,
    userId?: string,
    options?: { readonly readInBrowser: boolean },
  ) => Promise<void>;
  readonly acknowledgeCapture: (captureId: string) => Promise<void>;
  /** True when the global overlay shows captures; the app then shows no toast of its own. */
  readonly captureOverlay: boolean;
  /** The app window submitted the capture: forwards the receipt to the overlay. */
  readonly reportCaptureReceipt: (
    captureId: string,
    receipt: CaptureReceiptSummary,
  ) => Promise<void>;
  readonly reportCaptureFailed: (captureId: string, message: string) => Promise<void>;
  readonly onCaptureAction: (callback: (action: CaptureOverlayAction) => void) => () => void;
  readonly setCaptureShortcut: (accelerator: string) => Promise<boolean>;
  readonly getCaptureShortcut: () => Promise<string | null>;
  readonly getOnboardingPreferences: () => Promise<UserSettingsPatch | null>;
  readonly acknowledgeOnboardingPreferences: () => Promise<void>;
  readonly getPromptCaptureContext: () => Promise<PromptCaptureContext>;
  readonly nativeOverlayAvailable: () => Promise<boolean>;
  readonly readScreen: (sessionId: number) => Promise<PromptCaptureContext>;
  readonly onScreenInvalidated: (callback: (sessionId: number) => void) => () => void;
  readonly getNativeObservation: (sessionId: number) => Promise<DesktopNativeObservation>;
  readonly setNativeOverlayState: (sessionId: number, state: OverlayState) => Promise<void>;
  readonly annotateNativeOverlay: (
    sessionId: number,
    items: readonly OverlayAnnotation[],
  ) => Promise<void>;
  readonly clearNativeOverlay: (sessionId: number) => Promise<void>;
  readonly visualizeNativeOverlay: (
    sessionId: number,
    visible: boolean,
    interactive?: boolean,
    scene?: DesktopNativeScene,
    diagram?: DesktopNativeDiagram,
  ) => Promise<void>;
  readonly hidePrompt: () => Promise<void>;
  readonly onPromptHidden: (callback: () => void) => () => void;
  readonly onPromptShown: (callback: () => void) => () => void;
  readonly setPromptBusy: (busy: boolean) => Promise<void>;
  readonly openInMain: (path: string) => Promise<boolean>;
}

/** Available only in the bundled setup page, never in hosted web content. */
export interface AvenireSetupBridge extends AvenireWindowBridge {
  readonly getStatus: () => Promise<DesktopSetupStatus>;
  readonly requestPermission: (permission: DesktopPermission) => Promise<DesktopSetupStatus>;
  readonly complete: (choice: DesktopSetupChoice) => Promise<void>;
  readonly setShortcuts: (shortcuts: DesktopShortcuts) => Promise<DesktopSetupStatus>;
  readonly allowHotkeys: (enabled: boolean) => Promise<DesktopSetupStatus>;
  readonly requestNotifications: () => Promise<boolean>;
  readonly setTryCapture: (enabled: boolean, foreground: boolean) => Promise<void>;
  readonly onCapture: (callback: (capture: DesktopSetupCapture) => void) => () => void;
  readonly discardCapture: () => Promise<void>;
}
