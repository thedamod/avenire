import { contextBridge, ipcRenderer } from "electron";
import type { AvenireDesktopBridge, CapturePayload } from "./bridge.ts";

const bridge: AvenireDesktopBridge = {
  platform: process.platform,
  onCapture(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: CapturePayload) => callback(payload);
    ipcRenderer.on("avenire:capture", listener);
    return () => ipcRenderer.removeListener("avenire:capture", listener);
  },
  captureNow: () => ipcRenderer.invoke("avenire:capture-now").then(() => undefined),
  setCaptureShortcut: (accelerator) => ipcRenderer.invoke("avenire:set-shortcut", accelerator) as Promise<boolean>,
};

contextBridge.exposeInMainWorld("avenire", bridge);
