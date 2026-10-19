import * as Path from "node:path";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import type { CapturePayload } from "./bridge.ts";
import { appUrl, defaultCaptureShortcut } from "./config.ts";
import { collectSnapshot } from "./capture/collect.ts";
import { applyPolicy } from "./capture/policy.ts";
import { startTabsReceiver } from "./capture/tabs.ts";
import { externalUrl, isAppUrl, isAssetUrl } from "./navigation-policy.ts";

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
  // All desktop capabilities are explicit IPC; web content receives no ambient device grants.
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAssetUrl(url, appUrl)) openAsset(url);
    else if (!isAppUrl(url, appUrl)) {
      const safe = externalUrl(url);
      if (safe) void shell.openExternal(safe);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url, appUrl)) {
      event.preventDefault();
      const safe = externalUrl(url);
      if (safe) void shell.openExternal(safe);
    }
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url, appUrl)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  void window.loadURL(appUrl);
  window.on("closed", () => {
    window = undefined;
  });
}

/** Asset requests use the main window's cookie jar, including download redirects. */
function openAsset(url: string): void {
  if (!window || window.isDestroyed()) return;
  const asset = new BrowserWindow({
    width: 1000,
    height: 760,
    parent: window,
    webPreferences: {
      session: window.webContents.session,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  asset.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  asset.webContents.on("will-navigate", (event, nextUrl) => {
    if (!isAssetUrl(nextUrl, appUrl)) event.preventDefault();
  });
  asset.webContents.on("will-redirect", (event, nextUrl) => {
    if (!externalUrl(nextUrl)) event.preventDefault();
  });
  asset.webContents.on("will-attach-webview", (event) => event.preventDefault());
  void asset.loadURL(url);
}

function createTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("Avenire");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Capture now",
        click: () => {
          void capture();
        },
      },
      { label: "Show Avenire", click: () => window?.show() },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
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

function trustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  return (
    window !== undefined &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    isAppUrl(event.senderFrame.url, appUrl)
  );
}

ipcMain.handle("avenire:capture-now", (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  return capture();
});
ipcMain.handle("avenire:set-shortcut", (event, accelerator: unknown) => {
  if (!trustedSender(event)) return false;
  if (typeof accelerator !== "string" || accelerator.length === 0 || accelerator.length > 100)
    return false;
  return registerShortcut(accelerator);
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
