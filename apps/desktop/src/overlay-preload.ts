import { contextBridge, ipcRenderer } from "electron";
import type { AvenireOverlayBridge, CaptureOverlayState } from "./bridge.ts";

const bridge: AvenireOverlayBridge = {
  platform: process.platform,
  onState(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: CaptureOverlayState) =>
      callback(state);
    ipcRenderer.on("avenire:overlay-state", listener);
    // Register first; main replays through the same ordered IPC channel after load/reload.
    void ipcRenderer.invoke("avenire:overlay-ready");
    return () => ipcRenderer.removeListener("avenire:overlay-state", listener);
  },
  undo: (id) => ipcRenderer.invoke("avenire:overlay-undo", id).then(() => undefined),
  open: (id) => ipcRenderer.invoke("avenire:overlay-open", id).then(() => undefined),
  openSources: () => ipcRenderer.invoke("avenire:overlay-sources").then(() => undefined),
  setHovered: (hovered) =>
    ipcRenderer.invoke("avenire:overlay-hovered", hovered).then(() => undefined),
  dismissed: () => ipcRenderer.invoke("avenire:overlay-dismissed").then(() => undefined),
  resize: (height) => ipcRenderer.invoke("avenire:overlay-resize", height).then(() => undefined),
};
contextBridge.exposeInMainWorld("avenireOverlay", bridge);
