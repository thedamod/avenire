import { contextBridge, ipcRenderer } from "electron";
import type { AvenireDesktopBridge, CapturePayload } from "./bridge.ts";

ipcRenderer.on("avenire:capture-diagnostic", (_event, diagnostic: unknown) => {
  console.info("[capture]", diagnostic);
});

const bridge: AvenireDesktopBridge = {
  platform: process.platform,
  captureOverlay: process.argv?.includes("--avenire-capture-overlay") ?? false,
  reportCaptureReceipt: (id, receipt) =>
    ipcRenderer.invoke("avenire:capture-receipt", id, receipt).then(() => undefined),
  reportCaptureFailed: (id, message) =>
    ipcRenderer.invoke("avenire:capture-failed", id, message).then(() => undefined),
  onCaptureAction(callback) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      action: import("./bridge.ts").CaptureOverlayAction,
    ) => callback(action);
    ipcRenderer.on("avenire:capture-action", listener);
    return () => ipcRenderer.removeListener("avenire:capture-action", listener);
  },
  getWindowChrome: () => ipcRenderer.invoke("avenire:window-chrome"),
  setWindowTheme: (theme) =>
    ipcRenderer.invoke("avenire:window-theme", theme).then(() => undefined),
  onCapture(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: CapturePayload) =>
      callback(payload);
    ipcRenderer.on("avenire:capture", listener);
    return () => ipcRenderer.removeListener("avenire:capture", listener);
  },
  onCaptureStarted(callback) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: import("./bridge.ts").CaptureStarted,
    ) => callback(payload);
    ipcRenderer.on("avenire:capture-started", listener);
    return () => ipcRenderer.removeListener("avenire:capture-started", listener);
  },
  onCaptureProgress(callback) {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: import("./bridge.ts").CaptureProgress,
    ) => callback(payload);
    ipcRenderer.on("avenire:capture-progress", listener);
    return () => ipcRenderer.removeListener("avenire:capture-progress", listener);
  },
  reopen: (fileId, plan) => ipcRenderer.invoke("avenire:reopen", { fileId, plan }),
  extensionConnected: () => ipcRenderer.invoke("avenire:extension-connected"),
  captureNow: () => ipcRenderer.invoke("avenire:capture-now").then(() => undefined),
  setCaptureReady: (ready, userId, options) =>
    ipcRenderer.invoke("avenire:capture-ready", ready, userId, options).then(() => undefined),
  acknowledgeCapture: (captureId) =>
    ipcRenderer.invoke("avenire:capture-ack", captureId).then(() => undefined),
  setCaptureShortcut: (accelerator) =>
    ipcRenderer.invoke("avenire:set-shortcut", accelerator) as Promise<boolean>,
  getCaptureShortcut: () => ipcRenderer.invoke("avenire:get-shortcut") as Promise<string | null>,
  getOnboardingPreferences: () => ipcRenderer.invoke("avenire:onboarding-preferences"),
  acknowledgeOnboardingPreferences: () =>
    ipcRenderer.invoke("avenire:onboarding-preferences-ack").then(() => undefined),
  getPromptCaptureContext: () => ipcRenderer.invoke("avenire:prompt-capture-context"),
  nativeOverlayAvailable: () => ipcRenderer.invoke("avenire:native-overlay-available"),
  readScreen: (id) => ipcRenderer.invoke("avenire:read-screen", id),
  onScreenInvalidated(callback) {
    const listener = (_event: Electron.IpcRendererEvent, id: number) => callback(id);
    ipcRenderer.on("avenire:screen-invalidated", listener);
    return () => ipcRenderer.removeListener("avenire:screen-invalidated", listener);
  },
  getNativeObservation: (id) => ipcRenderer.invoke("avenire:native-observation", id),
  setNativeOverlayState: (id, state) =>
    ipcRenderer.invoke("avenire:native-overlay-state", id, state).then(() => undefined),
  annotateNativeOverlay: (id, items) =>
    ipcRenderer.invoke("avenire:native-overlay-annotate", id, items).then(() => undefined),
  clearNativeOverlay: (id) =>
    ipcRenderer.invoke("avenire:native-overlay-clear", id).then(() => undefined),
  visualizeNativeOverlay: (id, visible, interactive, scene, diagram) =>
    ipcRenderer
      .invoke("avenire:native-overlay-visualize", id, visible, interactive, scene, diagram)
      .then(() => undefined),
  hidePrompt: () => ipcRenderer.invoke("avenire:hide-prompt").then(() => undefined),
  onPromptHidden(callback) {
    const listener = () => callback();
    ipcRenderer.on("avenire:prompt-hidden", listener);
    return () => ipcRenderer.removeListener("avenire:prompt-hidden", listener);
  },
  onPromptShown(callback) {
    const listener = () => callback();
    ipcRenderer.on("avenire:prompt-shown", listener);
    return () => ipcRenderer.removeListener("avenire:prompt-shown", listener);
  },
  setPromptBusy: (busy) =>
    ipcRenderer.invoke("avenire:set-prompt-busy", busy).then(() => undefined),
  openInMain: (path) => ipcRenderer.invoke("avenire:open-in-main", path) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("avenire", bridge);
