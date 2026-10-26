import type { MenuItemConstructorOptions } from "electron";

export interface TrayState {
  readonly platform: NodeJS.Platform;
  readonly setupCompleted: boolean;
  readonly captureReady: boolean;
  readonly captureRunning: boolean;
  readonly shortcutsEnabled: boolean;
  readonly promptShortcut: string | undefined;
  readonly captureShortcut: string | undefined;
}

/** Pure menu description; main.ts owns every side effect. */
export function trayTemplate(state: TrayState): MenuItemConstructorOptions[] {
  const captureReason = !state.setupCompleted
    ? "finish desktop setup"
    : !state.captureReady
      ? "sign in and let Avenire finish loading"
      : state.captureRunning
        ? "capture in progress"
        : undefined;
  return [
    {
      id: "prompt",
      label: "Ask Ruth…",
      enabled: state.setupCompleted,
      ...(state.promptShortcut ? { accelerator: state.promptShortcut } : {}),
      registerAccelerator: false,
    },
    {
      id: "capture",
      label: captureReason ? `Capture now — ${captureReason}` : "Capture now",
      enabled: captureReason === undefined,
      ...(state.captureShortcut ? { accelerator: state.captureShortcut } : {}),
      registerAccelerator: false,
    },
    { type: "separator" },
    { id: "home", label: "Open Avenire" },
    { id: "tasks", label: "Chats and Tasks" },
    { id: "settings", label: "Settings" },
    { type: "separator" },
    {
      id: "shortcuts",
      label: state.shortcutsEnabled ? "Pause shortcuts" : "Resume shortcuts",
      type: "checkbox",
      checked: !state.shortcutsEnabled,
      enabled: state.setupCompleted,
    },
    { id: "pair", label: "Pair browser extension…", enabled: state.captureReady },
    { id: "setup", label: "Desktop setup…" },
    { type: "separator" },
    {
      id: "quit",
      label: state.platform === "win32" ? "Exit Avenire" : "Quit Avenire",
      ...(state.platform === "darwin" ? { accelerator: "Cmd+Q" } : {}),
      registerAccelerator: false,
    },
  ];
}
