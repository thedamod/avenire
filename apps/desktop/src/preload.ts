import { contextBridge, ipcRenderer } from "electron";
import type { AvenireDesktopBridge, CapturePayload } from "./bridge.ts";

const bridge: AvenireDesktopBridge = {
  platform: process.platform,
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
  hidePrompt: () => ipcRenderer.invoke("avenire:hide-prompt").then(() => undefined),
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
