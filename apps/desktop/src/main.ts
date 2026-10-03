import * as Path from "node:path";
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import type { CapturePayload } from "./bridge.ts";
import { appUrl, defaultCaptureShortcut } from "./config.ts";
import { collectSnapshot } from "./capture/collect.ts";
import { applyPolicy } from "./capture/policy.ts";
import { startTabsReceiver } from "./capture/tabs.ts";

let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let captureShortcut: string | undefined;
let captureRunning = false;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => window?.show());
  app.whenReady().then(() => {
    createWindow();
    createTray();
    startTabsReceiver();
    registerShortcut(defaultCaptureShortcut);
    app.on("activate", () => window?.show());
  });
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    webPreferences: {
      preload: Path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const allowedOrigin = new URL(appUrl).origin;
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== allowedOrigin) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== allowedOrigin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  void window.loadURL(appUrl);
  window.on("closed", () => { window = undefined; });
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Avenire");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Capture now", click: () => { void capture(); } },
    { label: "Show Avenire", click: () => window?.show() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("double-click", () => window?.show());
}

/** Swap the capture hotkey, keeping the previous one if the new accelerator is taken. */
function registerShortcut(accelerator: string): boolean {
  if (accelerator === captureShortcut) return true;
  const onPress = () => void capture();
  if (!globalShortcut.register(accelerator, onPress)) return false;
  if (captureShortcut !== undefined) globalShortcut.unregister(captureShortcut);
  captureShortcut = accelerator;
  return true;
}

async function capture(): Promise<void> {
  if (captureRunning) return;
  captureRunning = true;
  const capturedAt = new Date().toISOString();
  try {
    const payload: CapturePayload = applyPolicy(await collectSnapshot(capturedAt));
    if (window && !window.isDestroyed()) {
      window.webContents.send("avenire:capture", payload);
      window.showInactive();
    }
  } finally {
    captureRunning = false;
  }
}

ipcMain.handle("avenire:capture-now", () => capture());
ipcMain.handle("avenire:set-shortcut", (_event, accelerator: unknown) => {
  if (typeof accelerator !== "string" || accelerator.length === 0 || accelerator.length > 100) return false;
  return registerShortcut(accelerator);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
