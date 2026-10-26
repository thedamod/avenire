import type {
  BlockedCategory,
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
  readonly note?: "changed-since-capture" | "missing";
}

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
  readonly setCaptureShortcut: (accelerator: string) => Promise<boolean>;
  readonly getCaptureShortcut: () => Promise<string | null>;
  readonly getOnboardingPreferences: () => Promise<UserSettingsPatch | null>;
  readonly acknowledgeOnboardingPreferences: () => Promise<void>;
  readonly hidePrompt: () => Promise<void>;
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
