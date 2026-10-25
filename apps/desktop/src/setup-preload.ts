import { contextBridge, ipcRenderer } from "electron";
import type { AvenireSetupBridge } from "./bridge.ts";

const bridge: AvenireSetupBridge = {
  getWindowChrome: () => ipcRenderer.invoke("avenire:window-chrome"),
  setWindowTheme: (theme) =>
    ipcRenderer.invoke("avenire:window-theme", theme).then(() => undefined),
  getStatus: () => ipcRenderer.invoke("avenire:setup-status"),
  requestPermission: (permission) => ipcRenderer.invoke("avenire:setup-permission", permission),
  complete: (choice) => ipcRenderer.invoke("avenire:setup-complete", choice),
  setShortcuts: (shortcuts) => ipcRenderer.invoke("avenire:setup-shortcuts", shortcuts),
  allowHotkeys: (enabled) => ipcRenderer.invoke("avenire:setup-hotkeys", enabled),
  requestNotifications: () => ipcRenderer.invoke("avenire:setup-notifications"),
  setTryCapture: (enabled, foreground) =>
    ipcRenderer.invoke("avenire:setup-try", enabled, foreground).then(() => undefined),
  onCapture: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, capture: Parameters<typeof callback>[0]) =>
      callback(capture);
    ipcRenderer.on("avenire:setup-capture", listener);
    return () => ipcRenderer.removeListener("avenire:setup-capture", listener);
  },
  discardCapture: () => ipcRenderer.invoke("avenire:setup-discard").then(() => undefined),
};
contextBridge.exposeInMainWorld("avenireSetup", bridge);
