import * as Path from "node:path";
import { pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import {
  DesktopPermission,
  DesktopSetupChoice,
  DesktopShortcuts,
  DesktopWindowTheme,
} from "@avenire/contracts";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
} from "electron";
import type { CapturePayload } from "./bridge.ts";
import {
  appUrl,
  defaultCaptureShortcut,
  defaultPromptShortcut,
  fallbackPromptShortcut,
} from "./config.ts";
import { collectSnapshot } from "./capture/collect.ts";
import { applyPolicy } from "@avenire/capture/policy";
import { startTabsReceiver } from "./capture/tabs.ts";
import { latestTabs, stopTabsReceiver, tabsReceiverAvailable } from "./capture/tabs.ts";
import { externalUrl, isAppUrl, isAssetUrl } from "./navigation-policy.ts";
import { DesktopSetup } from "./setup.ts";
import { trayTemplate } from "./tray.ts";
import { describeCapturedSources, uploadCapturedFiles } from "./capture/upload.ts";
import { captureUploadSession } from "./capture/session.ts";
import { DesktopAuth, isProviderAuthUrl } from "./auth.ts";

let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let captureShortcut: string | undefined;
let captureRunning = false;
let promptWindow: BrowserWindow | undefined;
let promptBusy = false;
let setupWindow: BrowserWindow | undefined;
let setup: DesktopSetup;
let captureReady = false;
let promptShortcut: string | undefined;
let quitting = false;
let pendingCapture: CapturePayload | undefined;
let captureOwner: string | undefined;
let pendingCaptureOwner: string | undefined;
let desktopAuth: DesktopAuth;
let requestedShortcuts = { capture: defaultCaptureShortcut, prompt: defaultPromptShortcut };
let setupHotkeys = false;
let setupNotifications = false;
let setupTry = false;
let setupForeground = false;
let stagedCapture: CapturePayload | undefined;
const setupPath = Path.join(__dirname, "onboarding.html");
const setupUrl = pathToFileURL(setupPath).href;
const loadAttempts = new WeakMap<BrowserWindow, number>();
const chromeOptions = {
  titleBarStyle: "hidden" as const,
  titleBarOverlay: { color: "#0b0b0b", symbolColor: "#a3a3a3", height: 40 },
  trafficLightPosition: { x: 12, y: 12 },
  autoHideMenuBar: true,
  icon: Path.join(__dirname, "icon.png"),
};

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showMain);
  app
    .whenReady()
    .then(async () => {
      setup = new DesktopSetup(Path.join(app.getPath("userData"), "desktop-setup.json"));
      await setup.load();
      requestedShortcuts = setup.shortcuts ?? requestedShortcuts;
      setupNotifications = setup.notificationsEnabled ?? false;
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
          { role: "editMenu" },
          { role: "viewMenu" },
          { role: "windowMenu" },
          { label: "Desktop", submenu: [{ label: "Desktop setup…", click: showSetup }] },
        ]),
      );
      showMain();
      createTray();
      startTabsReceiver();
      if (setup.completed && setup.hotkeysEnabled !== false) {
        setupHotkeys = true;
        registerShortcut(requestedShortcuts.capture);
        if (!registerPromptShortcut(requestedShortcuts.prompt)) {
          if (registerPromptShortcut(fallbackPromptShortcut))
            requestedShortcuts.prompt = fallbackPromptShortcut;
        }
      }
      rebuildTray();
      app.on("activate", showMain);
    })
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "Avenire could not start",
        error instanceof Error ? error.message : "Unknown startup error",
      );
      app.quit();
    });
}

function showMain(): void {
  if (!setup) return;
  if (!setup.completed) {
    showSetup();
    return;
  }
  if (!window || window.isDestroyed()) createWindow();
  else {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

function showSetup(): void {
  if (!setupWindow) {
    const target = new BrowserWindow({
      ...chromeOptions,
      width: 1200,
      height: 800,
      minWidth: 720,
      minHeight: 620,
      show: false,
      backgroundColor: "#0b0b0b",
      title: "Set up Avenire",
      webPreferences: {
        preload: Path.join(__dirname, "setup-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    setupWindow = target;
    target.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    target.webContents.session.setPermissionCheckHandler(() => false);
    target.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    target.webContents.on("will-navigate", (event) => event.preventDefault());
    target.webContents.on("will-redirect", (event) => event.preventDefault());
    target.webContents.on("will-attach-webview", (event) => event.preventDefault());
    target.once("ready-to-show", () => target.show());
    target.on("closed", () => {
      setupWindow = undefined;
      setupTry = false;
    });
    void target.loadFile(setupPath).catch(() => {
      dialog.showErrorBox(
        "Setup could not load",
        "Reinstall Avenire to restore its desktop setup files.",
      );
    });
  } else {
    if (setupWindow.isMinimized()) setupWindow.restore();
    setupWindow.show();
    setupWindow.focus();
  }
}

function reportCaptureError(error: unknown): void {
  dialog.showErrorBox(
    "Capture could not finish",
    error instanceof Error ? error.message : "Unknown capture error",
  );
}
function reportSignInError(error: unknown): void {
  dialog.showErrorBox(
    "Sign-in could not finish",
    error instanceof Error ? error.message : "Try again.",
  );
}

async function loadApp(target: BrowserWindow, url = appUrl): Promise<void> {
  const attempt = (loadAttempts.get(target) ?? 0) + 1;
  loadAttempts.set(target, attempt);
  try {
    await target.loadURL(url);
  } catch (cause) {
    if (target.isDestroyed() || loadAttempts.get(target) !== attempt) return;
    const failure = cause as { code?: string; errno?: number; message?: string };
    // OAuth handoff and newer navigations can abort a load without a connection failure.
    if (failure.code === "ERR_ABORTED" || failure.errno === -3) return;
    target.show();
    const { response } = await dialog
      .showMessageBox(target, {
        type: "error",
        title: "Could not connect to Avenire",
        message: "Check that the web app is running, then try again.",
        buttons: ["Retry", "Close"],
        defaultId: 0,
      })
      .catch(() => ({ response: 1 }));
    if (response === 0 && !target.isDestroyed()) void loadApp(target, url);
  }
}

function createWindow(): void {
  window = new BrowserWindow({
    ...chromeOptions,
    width: 1200,
    height: 800,
    show: false,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#111110",
    title: "Avenire",
    webPreferences: {
      preload: Path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // T3 Code's hidden-startup pattern: restore normal throttling after first paint.
      backgroundThrottling: false,
    },
  });
  // All desktop capabilities are explicit IPC; web content receives no ambient device grants.
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  applyNavigationPolicy(window);
  const target = window;
  desktopAuth?.close();
  desktopAuth = new DesktopAuth(
    appUrl,
    target.webContents.session,
    () => {
      if (!target.isDestroyed()) {
        void loadApp(target);
        showMain();
      }
    },
    reportSignInError,
  );
  target.once("ready-to-show", () => {
    target.webContents.setBackgroundThrottling(true);
    target.show();
  });
  target.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      captureReady = false;
      rebuildTray();
    }
  });
  const recoveries: number[] = [];
  target.webContents.on("render-process-gone", (_event, details) => {
    captureReady = false;
    rebuildTray();
    const now = Date.now();
    while (recoveries.length && now - recoveries[0]! > 60_000) recoveries.shift();
    if (["crashed", "oom", "abnormal-exit"].includes(details.reason) && recoveries.length < 2) {
      recoveries.push(now);
      void loadApp(target);
    } else
      dialog.showErrorBox(
        "Avenire needs to restart",
        "The window stopped responding. Quit and reopen Avenire.",
      );
  });
  // Keep the authenticated capture consumer alive while the tray remains available.
  target.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      target.hide();
    }
  });
  void loadApp(target);
  window.on("closed", () => {
    window = undefined;
    captureReady = false;
    rebuildTray();
    promptWindow?.destroy();
  });
}

function applyNavigationPolicy(target: BrowserWindow): void {
  target.webContents.setWindowOpenHandler(({ url }) => {
    if (isProviderAuthUrl(url)) void desktopAuth.start().catch(reportSignInError);
    else if (isAssetUrl(url, appUrl)) openAsset(url);
    else if (!isAppUrl(url, appUrl)) {
      const safe = externalUrl(url);
      if (safe) void shell.openExternal(safe);
    }
    return { action: "deny" };
  });
  target.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url, appUrl)) {
      event.preventDefault();
      if (isProviderAuthUrl(url)) {
        void desktopAuth.start().catch(reportSignInError);
        return;
      }
      const safe = externalUrl(url);
      if (safe) void shell.openExternal(safe);
    }
  });
  target.webContents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url, appUrl)) {
      event.preventDefault();
      if (isProviderAuthUrl(url)) void desktopAuth.start().catch(reportSignInError);
    }
  });
  target.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

function togglePrompt(): void {
  if (!setup?.completed) {
    showSetup();
    return;
  }
  if (promptWindow?.isFocused()) {
    promptWindow.hide();
    return;
  }
  if (!window || window.isDestroyed()) createWindow();
  if (!promptWindow) {
    promptWindow = new BrowserWindow({
      width: 520,
      height: 420,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      skipTaskbar: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        session: window!.webContents.session,
        preload: Path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    promptWindow.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    applyNavigationPolicy(promptWindow);
    promptWindow.on("blur", () => {
      if (!promptBusy) promptWindow?.hide();
    });
    promptWindow.on("closed", () => {
      promptWindow = undefined;
      promptBusy = false;
    });
    promptWindow.webContents.on("render-process-gone", () => {
      promptBusy = false;
      promptWindow?.hide();
    });
    promptWindow.webContents.on("did-finish-load", () => {
      promptBusy = false;
      if (promptWindow?.isFocused()) promptWindow.webContents.send("avenire:prompt-shown");
    });
    void loadApp(promptWindow, new URL("/prompt", appUrl).href);
  }
  const { x, y, width, height } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const promptWidth = Math.min(520, width);
  const promptHeight = Math.min(420, height);
  promptWindow.setBounds({
    x: x + width - promptWidth,
    y: y + height - promptHeight,
    width: promptWidth,
    height: promptHeight,
  });
  promptWindow.show();
  promptWindow.focus();
  promptWindow.webContents.send("avenire:prompt-shown");
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
  const image = nativeImage.createFromPath(Path.join(__dirname, "tray.png")).resize({ height: 18 });
  if (process.platform === "darwin") image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip("Avenire");
  rebuildTray();
  if (process.platform !== "darwin") tray.on("click", showMain);
}

function openTrayRoute(path: "/" | "/tasks" | "/settings"): void {
  const url = new URL(path, appUrl).href;
  if (!isAppUrl(url, appUrl)) return;
  showMain();
  if (setup.completed && window && !window.isDestroyed()) void loadApp(window, url);
}

let trayShortcutsUpdating = false;
async function toggleTrayShortcuts(): Promise<void> {
  if (trayShortcutsUpdating) return;
  trayShortcutsUpdating = true;
  const previous = setupHotkeys;
  try {
    setHotkeysEnabled(!previous);
    await setup.saveShortcuts(requestedShortcuts, setupHotkeys);
  } catch (error) {
    if (setupHotkeys !== previous) setHotkeysEnabled(previous);
    dialog.showErrorBox(
      "Shortcuts could not be changed",
      error instanceof Error ? error.message : "Try again in Desktop setup.",
    );
  } finally {
    trayShortcutsUpdating = false;
    rebuildTray();
  }
}

function rebuildTray(): void {
  if (!tray) return;
  const actions: Record<string, () => void> = {
    prompt: togglePrompt,
    capture: () => void capture().catch(reportCaptureError),
    home: () => openTrayRoute("/"),
    tasks: () => openTrayRoute("/tasks"),
    settings: () => openTrayRoute("/settings"),
    shortcuts: () => void toggleTrayShortcuts(),
    setup: showSetup,
    quit: () => app.quit(),
  };
  tray.setContextMenu(
    Menu.buildFromTemplate(
      trayTemplate({
        platform: process.platform,
        setupCompleted: setup.completed,
        captureReady: captureReady && !!captureOwner,
        captureRunning,
        shortcutsEnabled: setupHotkeys,
        promptShortcut: setupHotkeys ? promptShortcut : requestedShortcuts.prompt,
        captureShortcut: setupHotkeys ? captureShortcut : requestedShortcuts.capture,
      }).map((item) => ({ ...item, ...(item.id ? { click: actions[item.id] } : {}) })),
    ),
  );
}

/** Swap the capture hotkey, keeping the previous one if the new accelerator is taken. */
function registerShortcut(accelerator: string): boolean {
  if (accelerator === captureShortcut) return true;
  const onPress = () => void capture().catch(reportCaptureError);
  try {
    if (!globalShortcut.register(accelerator, onPress)) return false;
  } catch {
    return false;
  }
  if (captureShortcut !== undefined) globalShortcut.unregister(captureShortcut);
  captureShortcut = accelerator;
  rebuildTray();
  return true;
}

function registerPromptShortcut(accelerator: string): boolean {
  if (accelerator === promptShortcut) return true;
  try {
    if (!globalShortcut.register(accelerator, togglePrompt)) return false;
  } catch {
    return false;
  }
  if (promptShortcut) globalShortcut.unregister(promptShortcut);
  promptShortcut = accelerator;
  rebuildTray();
  return true;
}

function shortcutAvailable(accelerator: string, kind: "capture" | "prompt"): boolean {
  if (accelerator === (kind === "capture" ? captureShortcut : promptShortcut)) return true;
  if (accelerator === captureShortcut || accelerator === promptShortcut) return false;
  try {
    if (!globalShortcut.register(accelerator, () => {})) return false;
    globalShortcut.unregister(accelerator);
    return true;
  } catch {
    return false;
  }
}

async function captureSetup(): Promise<void> {
  if (captureRunning) return;
  captureRunning = true;
  rebuildTray();
  try {
    stagedCapture = applyPolicy(
      await collectSnapshot(new Date().toISOString(), {
        foreground: setupForeground && setup.permissions.foregroundAvailable,
      }),
    );
    const sources = describeCapturedSources(stagedCapture.snapshot);
    setupWindow?.webContents.send("avenire:setup-capture", {
      id: stagedCapture.snapshot.id,
      sources,
    });
    setupWindow?.showInactive();
  } finally {
    captureRunning = false;
    rebuildTray();
  }
}

async function capture(): Promise<void> {
  if (captureRunning) return;
  if (setupTry && setupWindow) {
    await captureSetup();
    return;
  }
  if (!setup?.completed) {
    showSetup();
    return;
  }
  if (!captureReady || !window || window.isDestroyed()) {
    showMain();
    return;
  }
  if (!captureOwner) return;
  if (pendingCapture) {
    window.webContents.send("avenire:capture", pendingCapture);
    window.showInactive();
    return;
  }
  captureRunning = true;
  rebuildTray();
  const owner = captureOwner;
  const capturedAt = new Date().toISOString();
  try {
    const avenireFetch = await captureUploadSession(window.webContents.session, appUrl, owner);
    const payload: CapturePayload =
      stagedCapture ??
      applyPolicy(
        await collectSnapshot(capturedAt, {
          foreground: setup.foregroundCapture && setup.permissions.foregroundAvailable,
        }),
      );
    const uploads = await uploadCapturedFiles(payload.snapshot, appUrl, avenireFetch);
    stagedCapture = undefined;
    // Retain the receipt until the renderer acknowledges submission, including across reloads.
    const snapshot = {
      ...payload.snapshot,
      windows: [],
      media: payload.snapshot.media.filter((entry) => !entry.filePath),
    };
    if (captureOwner !== undefined && captureOwner !== owner) return;
    pendingCapture = { ...payload, snapshot, uploads };
    pendingCaptureOwner = owner;
    if (window && !window.isDestroyed() && captureReady) {
      window.webContents.send("avenire:capture", pendingCapture);
      window.showInactive();
    }
  } finally {
    captureRunning = false;
    rebuildTray();
  }
}

function trustedSender(event: Electron.IpcMainInvokeEvent, target = window): boolean {
  return (
    target !== undefined &&
    !target.isDestroyed() &&
    event.sender === target.webContents &&
    event.senderFrame === target.webContents.mainFrame &&
    isAppUrl(event.senderFrame.url, appUrl)
  );
}

ipcMain.handle("avenire:capture-now", (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  return capture();
});
ipcMain.handle("avenire:capture-ready", (event, ready: unknown, userId: unknown) => {
  if (!trustedSender(event) || typeof ready !== "boolean") return;
  captureReady = ready && typeof userId === "string" && userId.length > 0 && userId.length <= 200;
  captureOwner = captureReady ? (userId as string) : undefined;
  rebuildTray();
  if (captureReady && pendingCaptureOwner !== captureOwner) pendingCapture = undefined;
  if (captureReady && pendingCapture) window!.webContents.send("avenire:capture", pendingCapture);
  else if (captureReady && stagedCapture) void capture().catch(reportCaptureError);
});
ipcMain.handle("avenire:capture-ack", (event, id: unknown) => {
  if (trustedSender(event) && id === pendingCapture?.snapshot.id) pendingCapture = undefined;
});

function trustedSetupSender(event: Electron.IpcMainInvokeEvent): boolean {
  return (
    setupWindow !== undefined &&
    !setupWindow.isDestroyed() &&
    event.sender === setupWindow.webContents &&
    event.senderFrame === setupWindow.webContents.mainFrame &&
    event.senderFrame.url === setupUrl
  );
}
function chromeWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  if (trustedSetupSender(event)) return setupWindow;
  if (trustedSender(event)) return window;
  return undefined;
}
ipcMain.handle("avenire:window-chrome", (event) => {
  if (promptWindow && trustedSender(event, promptWindow)) return null;
  if (!chromeWindow(event)) throw new Error("Untrusted desktop IPC sender");
  return { platform: process.platform, height: 40 };
});
ipcMain.handle("avenire:window-theme", (event, value: unknown) => {
  if (promptWindow && trustedSender(event, promptWindow)) return;
  const target = chromeWindow(event);
  if (!target) throw new Error("Untrusted desktop IPC sender");
  const theme = Schema.decodeUnknownSync(DesktopWindowTheme)(value);
  if (process.platform !== "darwin")
    target.setTitleBarOverlay({
      color: theme === "dark" ? "#0b0b0b" : "#fcfcfc",
      symbolColor: theme === "dark" ? "#a3a3a3" : "#141414",
      height: 40,
    });
});
function setupStatus() {
  return {
    completed: setup.completed,
    foregroundCapture: setup.foregroundCapture,
    platform: process.platform,
    ...setup.permissions,
    tabsConnected: latestTabs().length > 0,
    receiverAvailable: tabsReceiverAvailable(),
    captureShortcut: captureShortcut ?? null,
    promptShortcut: promptShortcut ?? null,
    requestedShortcuts,
    shortcutConflicts: {
      capture:
        requestedShortcuts.capture === requestedShortcuts.prompt ||
        !shortcutAvailable(requestedShortcuts.capture, "capture"),
      prompt:
        requestedShortcuts.capture === requestedShortcuts.prompt ||
        !shortcutAvailable(requestedShortcuts.prompt, "prompt"),
    },
    ...(setup.preferences ? { preferences: setup.preferences } : {}),
    hotkeysEnabled: setupHotkeys,
    notificationsEnabled: setupNotifications,
  };
}
ipcMain.handle("avenire:setup-status", (event) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  return setupStatus();
});
ipcMain.handle("avenire:setup-permission", async (event, permission: unknown) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  await setup.requestPermission(Schema.decodeUnknownSync(DesktopPermission)(permission));
  return setupStatus();
});
ipcMain.handle("avenire:setup-complete", async (event, choice: unknown) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  await setup.complete(Schema.decodeUnknownSync(DesktopSetupChoice)(choice));
  setupTry = false;
  rebuildTray();
  showMain();
  setupWindow?.close();
});
ipcMain.handle("avenire:setup-shortcuts", (event, value: unknown) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  const shortcuts = Schema.decodeUnknownSync(DesktopShortcuts)(value);
  requestedShortcuts = shortcuts;
  if (setupHotkeys) {
    registerShortcut(shortcuts.capture);
    registerPromptShortcut(shortcuts.prompt);
  }
  rebuildTray();
  return setupStatus();
});
ipcMain.handle("avenire:setup-hotkeys", (event, enabled: unknown) => {
  if (!trustedSetupSender(event) || typeof enabled !== "boolean")
    throw new Error("Untrusted desktop IPC sender");
  setHotkeysEnabled(enabled);
  return setupStatus();
});

function setHotkeysEnabled(enabled: boolean): void {
  if (enabled) {
    const previousCapture = captureShortcut;
    const previousPrompt = promptShortcut;
    if (
      !registerShortcut(requestedShortcuts.capture) ||
      !registerPromptShortcut(requestedShortcuts.prompt)
    ) {
      if (captureShortcut !== previousCapture && captureShortcut) {
        globalShortcut.unregister(captureShortcut);
        captureShortcut = undefined;
        if (previousCapture) registerShortcut(previousCapture);
      }
      if (promptShortcut !== previousPrompt && promptShortcut) {
        globalShortcut.unregister(promptShortcut);
        promptShortcut = undefined;
        if (previousPrompt) registerPromptShortcut(previousPrompt);
      }
      throw new Error("A shortcut is already in use. Go back and choose another shortcut.");
    }
  } else {
    if (captureShortcut) globalShortcut.unregister(captureShortcut);
    if (promptShortcut) globalShortcut.unregister(promptShortcut);
    captureShortcut = undefined;
    promptShortcut = undefined;
  }
  setupHotkeys = enabled;
  rebuildTray();
}

ipcMain.handle("avenire:setup-notifications", (event) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  if (!Notification.isSupported()) return false;
  setupNotifications = true;
  new Notification({
    title: "Avenire",
    body: "You’ll hear from Ruth when your morning report is ready.",
  }).show();
  return true;
});
ipcMain.handle("avenire:setup-try", (event, enabled: unknown, foreground: unknown) => {
  if (!trustedSetupSender(event) || typeof enabled !== "boolean" || typeof foreground !== "boolean")
    throw new Error("Untrusted desktop IPC sender");
  setupTry = enabled;
  setupForeground = foreground;
});
ipcMain.handle("avenire:setup-discard", (event) => {
  if (!trustedSetupSender(event)) throw new Error("Untrusted desktop IPC sender");
  stagedCapture = undefined;
});
ipcMain.handle("avenire:onboarding-preferences", (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  if (setup.preferencesSynced || !setup.preferences) return null;
  return { ...setup.preferences, notifications: { morningReport: setup.notificationsEnabled } };
});
ipcMain.handle("avenire:onboarding-preferences-ack", async (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  await setup.acknowledgePreferences();
});
ipcMain.handle("avenire:set-shortcut", async (event, accelerator: unknown) => {
  if (!trustedSender(event)) return false;
  if (typeof accelerator !== "string" || accelerator.length === 0 || accelerator.length > 100)
    return false;
  if (accelerator === requestedShortcuts.prompt) return false;
  if (setupHotkeys ? !registerShortcut(accelerator) : !shortcutAvailable(accelerator, "capture"))
    return false;
  const previous = requestedShortcuts;
  requestedShortcuts = { ...requestedShortcuts, capture: accelerator };
  try {
    await setup.saveShortcuts(requestedShortcuts, setupHotkeys);
  } catch (error) {
    requestedShortcuts = previous;
    if (setupHotkeys) registerShortcut(previous.capture);
    throw error;
  } finally {
    rebuildTray();
  }
  return true;
});
ipcMain.handle("avenire:get-shortcut", (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  return captureShortcut ?? null;
});

ipcMain.handle("avenire:hide-prompt", (event) => {
  if (!promptWindow || !trustedSender(event, promptWindow))
    throw new Error("Untrusted desktop IPC sender");
  promptWindow?.hide();
});
ipcMain.handle("avenire:set-prompt-busy", (event, busy: unknown) => {
  if (!promptWindow || !trustedSender(event, promptWindow))
    throw new Error("Untrusted desktop IPC sender");
  if (typeof busy !== "boolean") return;
  promptBusy = busy;
});
ipcMain.handle("avenire:open-in-main", async (event, path: unknown) => {
  if (!trustedSender(event) && !trustedSender(event, promptWindow)) return false;
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path)
  )
    return false;
  const url = new URL(path, appUrl).href;
  if (!isAppUrl(url, appUrl)) return false;
  if (!window || window.isDestroyed()) createWindow();
  await window!.loadURL(url);
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  promptWindow?.hide();
  return true;
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopTabsReceiver();
  desktopAuth?.close();
  tray?.destroy();
});
