import { screenSharingPermission } from "./screen-privacy.ts";
import {
  matchNativeScreen,
  displayStillPresent,
  matchHyprlandOutput,
  sameWaylandOutput,
  type NativeScreen,
} from "./display-selection.ts";
import {
  DesktopOverlayState,
  DesktopOverlayAnnotation,
  DesktopNativeScene,
  DesktopNativeDiagram,
  DesktopCursorPosition,
  DesktopNativeObservation,
} from "@avenire/contracts";
import {
  NativeOverlay,
  loadNativeOverlayConfig,
  type NativeOverlayConfig,
  type PromptCaptureContext,
} from "./native-overlay.ts";
import {
  captureLog,
  captureError,
  initializeCaptureLog,
  captureLogPath,
} from "./capture/diagnostics.ts";
import * as Path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import {
  DesktopPermission,
  DesktopSetupChoice,
  DesktopShortcuts,
  DesktopWindowTheme,
  ReopenPlan,
  LibraryFile,
  BlockedCategory,
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
import type {
  CapturePayload,
  CaptureStarted,
  CaptureProgress,
  CaptureReceiptSummary,
} from "./bridge.ts";
import {
  appUrl,
  defaultCaptureShortcut,
  defaultPromptShortcut,
  fallbackPromptShortcut,
  isWayland,
} from "./config.ts";
import { instantCapture, setCaptureDeviceId, collectSnapshot } from "./capture/collect.ts";
import { applyPolicy } from "@avenire/capture/policy";
import { extensionChannel, resetTabsOwner, startTabsReceiver } from "./capture/tabs.ts";
import { latestTabs, stopTabsReceiver, tabsReceiverAvailable } from "./capture/tabs.ts";
import { externalUrl, isAppUrl, isAssetUrl } from "./navigation-policy.ts";
import { DesktopSetup } from "./setup.ts";
import { trayTemplate } from "./tray.ts";
import { describeCapturedSources } from "./capture/upload.ts";
import { captureUploadSession } from "./capture/session.ts";
import { loadInstallIdentity } from "./capture/identity.ts";
import { LocalOriginRegistry } from "./capture/registry.ts";
import { PairingAuthority } from "./capture/pairing.ts";
import { startForegroundPoll } from "./capture/foreground.ts";
import { prewarmPowerShell } from "./capture/collectors/ps-queue.ts";
import { CaptureProgressStream } from "./capture/progress.ts";
import { captureItems, runCapturePipeline } from "./capture/pipeline.ts";
import { executeReopen } from "./capture/reopen.ts";
import { captureLibraryClient } from "./capture/library-client.ts";
import { planReopen } from "@avenire/capture/reopen";
import { CaptureOverlay, captureOverlayAssetsAvailable } from "./capture-overlay.ts";
import { captureFailureReason } from "./capture/failure.ts";
import { startNativePoll, clearNativeCache } from "./capture/native.ts";
import { DesktopAuth, isProviderAuthUrl } from "./auth.ts";

let window: BrowserWindow | undefined;
let tray: Tray | undefined;
let captureShortcut: string | undefined;
let captureRunning = false;
let promptWindow: BrowserWindow | undefined;
let promptBusy = false;
let nativeOverlayConfig: NativeOverlayConfig;
let nativeOverlay: NativeOverlay | undefined;
let promptGeneration = 0;
let promptOpening = false;
let promptNativeScreenId: string | undefined;
let promptCaptureRunning = false;
let promptCaptureInvalidated = false;
let nativePromptStarting: Promise<void> | undefined;
let promptScreenSession: string | undefined;
let promptCaptureContext: PromptCaptureContext = { sessionId: 0, capture: null };

let screenPermissionTimer: ReturnType<typeof setInterval> | undefined;
function endNativePrompt(): void {
  clearInterval(screenPermissionTimer);
  screenPermissionTimer = undefined;
  promptScreenSession = undefined;
  promptCaptureInvalidated = false;
  promptGeneration++;
  promptOpening = false;
  promptNativeScreenId = undefined;
  nativePromptStarting = undefined;
  nativeOverlay?.dispose();
  nativeOverlay = undefined;
  promptCaptureContext = { sessionId: promptGeneration, capture: null };
}
function hidePrompt(): void {
  endNativePrompt();
  promptWindow?.destroy();
}

let setupWindow: BrowserWindow | undefined;
let setup: DesktopSetup;
let captureReady = false;
let promptShortcut: string | undefined;
let quitting = false;
let pendingCapture: CapturePayload | undefined;
let pendingStream: CaptureProgressStream | undefined;
let captureOwner: string | undefined;
let pendingCaptureOwner: string | undefined;
let desktopAuth: DesktopAuth;
let registry: LocalOriginRegistry;
let pairing: PairingAuthority;
let deviceId: string;
let captureOverlay: CaptureOverlay | undefined;
let stopNativePoll: (() => void) | undefined;
let stopForegroundPoll: (() => void) | undefined;
let activeCapture:
  | { owner: string; controller: AbortController; stream: CaptureProgressStream }
  | undefined;
let lastOwner: string | undefined;
let readInBrowser = false;
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
  icon: Path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
};

let pendingPromptShortcut = process.argv.includes("--avenire-prompt");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--avenire-prompt")) {
      if (setup) togglePrompt();
      else pendingPromptShortcut = true;
    } else showMain();
  });
  app
    .whenReady()
    .then(async () => {
      initializeCaptureLog(app.getPath("logs"));
      nativeOverlayConfig = loadNativeOverlayConfig({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
        wayland: process.platform === "linux" && isWayland,
      });
      const userData = app.getPath("userData");
      deviceId = loadInstallIdentity(userData).deviceId;
      setCaptureDeviceId(deviceId);
      registry = new LocalOriginRegistry(Path.join(userData, "capture-origins.json"));
      pairing = new PairingAuthority(Path.join(userData, "capture-pairings.json"));
      await Promise.all([registry.load(), pairing.load()]);
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
      if (pendingPromptShortcut) {
        pendingPromptShortcut = false;
        togglePrompt();
      } else showMain();
      captureOverlay = new CaptureOverlay(
        Path.join(__dirname, "capture-overlay.html"),
        Path.join(__dirname, "overlay-preload.cjs"),
      );
      createTray();
      startTabsReceiver(
        pairing,
        () => void capture().catch(reportCaptureError),
        app.getPath("downloads"),
        () => (captureOwner ? registry.downloads(captureOwner) : []),
      );
      stopForegroundPoll = startForegroundPoll(
        () => (setup.completed && setup.foregroundCapture) || (setupTry && setupForeground),
      );
      void prewarmPowerShell().catch(() => {});
      stopNativePoll = startNativePoll(
        () => (setup.completed && setup.foregroundCapture) || (setupTry && setupForeground),
      );
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
  captureLog("Capture failed", captureError(error));
  dialog.showErrorBox("Capture could not finish", captureFailureReason(error));
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

function createWindow(showOnReady = true): void {
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
      additionalArguments: captureOverlayAssetsAvailable(__dirname)
        ? ["--avenire-capture-overlay"]
        : [],
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
    if (showOnReady) target.show();
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
  void showPrompt().catch((error: unknown) => {
    endNativePrompt();
    captureLog("native-prompt-error", captureError(error));
  });
}
async function selectNativePromptDisplay(
  native: NativeOverlay,
  display: Electron.Rectangle,
  generation: number,
): Promise<void> {
  const inspection = (await native.request("inspect")) as { screens?: NativeScreen[] };
  const selected = matchNativeScreen(display, inspection.screens);
  if (generation !== promptGeneration || nativeOverlay !== native)
    throw new Error("Stale native overlay session");
  await native.request("select_screen", { screenId: selected.id });
  if (generation !== promptGeneration || nativeOverlay !== native)
    throw new Error("Stale native overlay session");
  promptNativeScreenId = selected.id;
  // select_screen disarmed the previous observation. Invalidation after this
  // point belongs to the new selection, including while show is pending.
  promptCaptureInvalidated = false;
  await native.request("show", { screenId: selected.id });
  if (generation !== promptGeneration || nativeOverlay !== native)
    throw new Error("Stale native overlay session");
}
async function initializeNativePrompt(
  generation: number,
  display: Electron.Rectangle,
): Promise<void> {
  if (nativeOverlayConfig?.enabled) {
    const native = new NativeOverlay(
      nativeOverlayConfig,
      () => {
        if (generation === promptGeneration && nativeOverlay === native) hidePrompt();
      },
      () => {
        if (generation !== promptGeneration || nativeOverlay !== native) return;
        promptCaptureContext = { sessionId: generation, capture: null };
        if (promptCaptureRunning) {
          // A fresh read supersedes the old observation. Do not cancel the tool
          // obtaining its replacement, but reject any newly invalidated pixels.
          promptCaptureInvalidated = true;
        } else promptWindow?.webContents.send("avenire:screen-invalidated", generation);
      },
      () => {
        if (generation !== promptGeneration || nativeOverlay !== native) return;
        nativeOverlay = undefined;
        promptNativeScreenId = undefined;
        promptCaptureContext = {
          sessionId: generation,
          capture: null,
          error: "Native presentation stopped; request a fresh screen read",
        };
        promptWindow?.webContents.send("avenire:screen-invalidated", generation);
      },
    );
    nativeOverlay = native;
    try {
      // Initialize only on read_screen, using this read's cursor/display snapshot.
      await selectNativePromptDisplay(native, display, generation);
      promptCaptureContext = { sessionId: generation, capture: null };
    } catch (error) {
      if (generation !== promptGeneration || nativeOverlay !== native) {
        native.dispose();
        throw error;
      }
      captureLog("native-screen-context-error", captureError(error));
      native.dispose();
      nativeOverlay = undefined;
      promptCaptureContext = {
        sessionId: generation,
        capture: null,
        error: error instanceof Error ? error.message : "Native overlay unavailable",
      };
      throw error;
    }
  }
  if (!nativeOverlay) throw new Error("Local screen capture is disabled");
}
function ensureNativePrompt(display: Electron.Rectangle): Promise<void> {
  const generation = promptGeneration;
  if (nativeOverlay?.available && !nativePromptStarting)
    return selectNativePromptDisplay(nativeOverlay, display, generation);
  return (nativePromptStarting ??= initializeNativePrompt(generation, display).finally(() => {
    if (generation === promptGeneration) nativePromptStarting = undefined;
  }));
}
/** Preload the authenticated prompt without showing it or starting Qt. */
function ensurePromptWindow(): void {
  if (!window || window.isDestroyed() || quitting) return;
  if (!promptWindow) {
    promptWindow = new BrowserWindow({
      icon: chromeOptions.icon,
      title: "Avenire Ask Ava",
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
    promptWindow.on("page-title-updated", (event) => event.preventDefault());
    promptWindow.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      promptWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    let promptLoaded = false;
    let promptHadFocus = false;
    let promptShownAt = 0;
    applyNavigationPolicy(promptWindow);
    promptWindow.on("show", () => {
      promptShownAt = Date.now();
    });
    promptWindow.on("focus", () => {
      promptHadFocus = true;
    });
    promptWindow.on("blur", () => {
      if (
        !(process.platform === "linux" && isWayland) &&
        promptHadFocus &&
        !promptBusy &&
        Date.now() - promptShownAt > 750
      )
        hidePrompt();
    });
    promptWindow.on("hide", () => {
      promptHadFocus = false;
      endNativePrompt();
      promptWindow?.webContents.send("avenire:prompt-hidden");
    });
    promptWindow.on("closed", () => {
      endNativePrompt();
      promptWindow = undefined;
      promptBusy = false;
    });
    promptWindow.webContents.on("render-process-gone", () => {
      promptBusy = false;
      hidePrompt();
    });
    promptWindow.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
      if (promptLoaded && mainFrame && !inPlace) hidePrompt();
    });
    promptWindow.webContents.on("did-finish-load", () => {
      promptLoaded = true;
      if (new URL(promptWindow!.webContents.getURL()).pathname !== "/prompt") endNativePrompt();
      promptBusy = false;
      if (promptWindow?.isFocused()) promptWindow.webContents.send("avenire:prompt-shown");
    });
    void loadApp(promptWindow, new URL("/prompt", appUrl).href);
  }
}

async function showPrompt(): Promise<void> {
  if (!setup?.completed) {
    showSetup();
    return;
  }
  if (promptOpening || promptWindow?.isFocused()) {
    hidePrompt();
    return;
  }
  if (promptWindow?.isVisible()) {
    promptWindow.focus();
    promptWindow.webContents.send("avenire:prompt-shown");
    return;
  }
  endNativePrompt();
  const generation = promptGeneration;
  promptOpening = true;
  if (generation !== promptGeneration || quitting) return;
  promptOpening = false;
  if (!window || window.isDestroyed()) createWindow(false);
  ensurePromptWindow();
  if (!promptWindow) return;
  const { x, y, width, height } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const promptWidth = Math.min(400, width);
  const promptHeight = Math.min(420, height);
  promptWindow.setBounds({
    x: x + width - promptWidth - 12,
    y: y + height - promptHeight - 12,
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
    icon: chromeOptions.icon,
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
    "capture-log": () => {
      const path = captureLogPath();
      if (path) shell.showItemInFolder(path);
    },
    pair: () => {
      try {
        const code = pairing.issueCode();
        if (Notification.isSupported())
          new Notification({
            title: "Pair browser extension",
            body: `Enter ${code} in the Avenire extension. This code expires in 10 minutes and works once.`,
          }).show();
        void dialog.showMessageBox({
          type: "info",
          title: "Pair browser extension",
          message: code,
          detail:
            "Enter this code in the Avenire extension. It expires in 10 minutes and works once.",
          buttons: ["Done"],
        });
      } catch {
        dialog.showErrorBox(
          "Pair browser extension",
          "Sign in to Avenire before pairing the extension.",
        );
      }
    },
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
        foreground: setupForeground,
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

/** Packaged Windows GUI processes may have no terminal; mirror safe stage counts to DevTools. */
function captureDiagnostic(
  stage: string,
  details: Readonly<Record<string, string | number | boolean>> = {},
) {
  captureLog(stage, details);
  if (window && !window.isDestroyed()) {
    try {
      window.webContents.send("avenire:capture-diagnostic", { stage, ...details });
    } catch {
      /* Closing the app's renderer must not interrupt capture. */
    }
  }
}

/** The overlay is a view of the capture; a native window failure must not cancel saving. */
function updateCaptureOverlay(update: (overlay: CaptureOverlay) => void): void {
  if (!captureOverlay) return;
  try {
    update(captureOverlay);
  } catch (error) {
    captureLog("Overlay could not update", captureError(error));
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
    captureDiagnostic("Retrying submission of the previous capture");
    restoreCaptureOverlay(captureOwner, pendingStream);
    const owner = captureOwner;
    const id = pendingCapture.snapshot.id;
    updateCaptureOverlay((overlay) => overlay.submitting(owner, id));
    window.webContents.send("avenire:capture", pendingCapture);
    return;
  }
  const owner = captureOwner;
  const controller = new AbortController();
  let initial: CapturePayload | undefined;
  captureRunning = true;
  try {
    rebuildTray();
    const capturedAt = new Date().toISOString();
    // All preparation belongs to the same single-flight lifetime as reading and uploading.
    const staged = stagedCapture;
    let instant = staged
      ? { snapshot: staged.snapshot, resolve: async () => staged.snapshot }
      : instantCapture(capturedAt, setup.foregroundCapture);
    initial = staged ?? applyPolicy(instant.snapshot);

    pendingCaptureOwner = owner;
    const stream = new CaptureProgressStream(
      { id: initial.snapshot.id, items: captureItems(initial.snapshot) },
      (channel, payload) => {
        if (captureOwner === owner && lastOwner === owner) {
          updateCaptureOverlay((overlay) => {
            if (channel === "avenire:capture-started")
              overlay.begin(owner, payload as CaptureStarted, captureShortcut);
            else overlay.progress(owner, payload as CaptureProgress);
          });
        }
        if (
          captureReady &&
          captureOwner === owner &&
          lastOwner === owner &&
          window &&
          !window.isDestroyed()
        )
          window.webContents.send(channel, payload);
      },
    );
    activeCapture = { owner, controller, stream };
    captureDiagnostic("Started", {
      tabs: initial.snapshot.tabs.length,
      windows: initial.snapshot.windows.length,
      extension: extensionChannel?.connected() ?? false,
      readInBrowser,
    });
    // Cached reports can be absent after wake/reconnect or miss a just-opened tab. Show the
    // overlay first, then give the paired browser 300ms to report all current permitted tabs.
    if (!staged && extensionChannel?.connected()) {
      await extensionChannel.refreshTabs(300, controller.signal);
      controller.signal.throwIfAborted();
      if (lastOwner !== owner) return;
      const refreshed = instantCapture(capturedAt, setup.foregroundCapture);
      const id = initial.snapshot.id;
      initial = applyPolicy({ ...refreshed.snapshot, id });
      instant = {
        snapshot: initial.snapshot,
        resolve: async () => ({ ...(await refreshed.resolve()), id }),
      };
      captureDiagnostic("Browser refreshed", { tabs: initial.snapshot.tabs.length });
      const existing = new Set(stream.started.items.map((item) => item.key));
      for (const item of captureItems(initial.snapshot))
        if (!existing.has(item.key)) stream.progress(item);
    }
    const session = captureUploadSession(window.webContents.session, appUrl, owner);
    void session.catch(() => {}); // The pipeline observes and reports session failure after resolution.
    const payload = await runCapturePipeline({
      initial,
      resolve: instant.resolve,
      session,
      appUrl,
      owner,
      registry,
      stream,
      ...(extensionChannel ? { channel: extensionChannel } : {}),
      readInBrowser,
      signal: controller.signal,
    });
    if (lastOwner !== owner || controller.signal.aborted) {
      captureLog("Cancelled after account or session change");
      return;
    }
    stagedCapture = undefined;
    captureDiagnostic("Collected", {
      saved: payload.uploads?.files.length ?? 0,
      skipped: payload.uploads?.skipped.length ?? 0,
      queuedTabs: payload.snapshot.tabs.length,
    });
    pendingCapture = payload;
    pendingStream = stream;
    pendingCaptureOwner = owner;
    activeCapture = undefined;
    if (window && !window.isDestroyed() && captureReady && captureOwner === owner) {
      updateCaptureOverlay((overlay) => overlay.submitting(owner, payload.snapshot.id));
      window.webContents.send("avenire:capture", pendingCapture);
      captureDiagnostic("Sent to the app for submission");
    }
  } catch (error) {
    if (!controller.signal.aborted && lastOwner === owner) {
      const reason = captureFailureReason(error);
      captureLog("Failed", { reason, ...captureError(error) });
      if (initial) {
        const id = initial.snapshot.id;
        updateCaptureOverlay((overlay) => overlay.failed(owner, id, reason));
      } else {
        dialog.showErrorBox("Capture could not start", reason);
      }
    }
  } finally {
    if (activeCapture?.controller === controller) activeCapture = undefined;
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
ipcMain.handle(
  "avenire:capture-ready",
  (event, ready: unknown, userId: unknown, options: unknown) => {
    if (!trustedSender(event) || typeof ready !== "boolean") return;
    captureReady = ready && typeof userId === "string" && userId.length > 0 && userId.length <= 200;
    const nextOwner = captureReady ? (userId as string) : undefined;
    if (nextOwner && lastOwner !== nextOwner) {
      activeCapture?.controller.abort();
      activeCapture = undefined;
      pendingCapture = undefined;
      pendingStream = undefined;
      pendingCaptureOwner = undefined;
      if (lastOwner !== undefined) stagedCapture = undefined;
      lastOwner = nextOwner;
    }
    if (captureOwner !== nextOwner) {
      // Hidden preloaded documents must not retain another signed-in user's state.
      endNativePrompt();
      promptWindow?.destroy();
      captureOverlay?.clear();
      clearNativeCache();
      resetTabsOwner();
      pairing.setOwner(nextOwner);
      if (nextOwner)
        void pairing
          .refreshToken(
            nextOwner,
            deviceId,
            appUrl,
            captureUploadSession(window!.webContents.session, appUrl, nextOwner),
          )
          .catch(() => {}); // Offline users can still pair with a code or an existing secret.
    }
    captureOwner = nextOwner;
    readInBrowser =
      captureReady &&
      typeof options === "object" &&
      options !== null &&
      (options as { readInBrowser?: unknown }).readInBrowser === true;
    rebuildTray();
    if (captureReady && pendingCaptureOwner !== captureOwner) pendingCapture = undefined;
    if (captureReady && pendingCapture) {
      restoreCaptureOverlay(captureOwner, pendingStream);
      const owner = captureOwner!;
      const id = pendingCapture.snapshot.id;
      updateCaptureOverlay((overlay) => overlay.submitting(owner, id));
      window!.webContents.send("avenire:capture", pendingCapture);
    } else if (captureReady && activeCapture && activeCapture.owner === captureOwner) {
      restoreCaptureOverlay(captureOwner, activeCapture.stream);
      activeCapture.stream.replay((channel, value) => window!.webContents.send(channel, value));
    } else if (captureReady && stagedCapture) void capture().catch(reportCaptureError);
  },
);
ipcMain.handle("avenire:capture-ack", (event, id: unknown) => {
  if (
    trustedSender(event) &&
    captureReady &&
    captureOwner === pendingCaptureOwner &&
    id === pendingCapture?.snapshot.id
  ) {
    pendingCapture = undefined;
    pendingStream = undefined;
    pendingCaptureOwner = undefined;
  }
});
ipcMain.handle("avenire:extension-connected", (event) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  return captureReady && (extensionChannel?.connected() ?? false);
});
ipcMain.handle("avenire:reopen", async (event, value: unknown) => {
  if (!trustedSender(event)) throw new Error("Untrusted desktop IPC sender");
  const owner = captureOwner;
  if (!owner || !captureReady) return { ok: false };
  try {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({
        fileId: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/i)),
        plan: Schema.optional(ReopenPlan),
      }),
    )(value);
    return reopenForOwner(owner, input.fileId, input.plan);
  } catch {
    return { ok: false, note: "missing" };
  }
});

async function reopenForOwner(owner: string, fileId: string, plan?: ReopenPlan) {
  try {
    if (!captureReady || captureOwner !== owner || !window || window.isDestroyed())
      return { ok: false };
    const fetch = await captureUploadSession(window!.webContents.session, appUrl, owner);
    const library = captureLibraryClient(appUrl, fetch);
    return await executeReopen(fileId, plan, {
      owner,
      deviceId,
      registry,
      getFile: library.getFile,
      opened: library.opened,
      openPath: (path) => shell.openPath(path),
      openExternal: (url) => shell.openExternal(url),
      ...(extensionChannel ? { extension: extensionChannel } : {}),
      stillOwner: () => captureReady && captureOwner === owner,
    });
  } catch {
    return { ok: false };
  }
}
function restoreCaptureOverlay(
  owner: string | undefined,
  stream: CaptureProgressStream | undefined,
) {
  if (!owner || !stream || !captureOverlay || captureOverlay.state?.id === stream.started.id)
    return;
  updateCaptureOverlay((overlay) => {
    overlay.begin(owner, stream.started, captureShortcut);
    for (const event of stream.events) overlay.progress(owner, event);
  });
}
async function showAppRoute(path: string): Promise<void> {
  const url = new URL(path, appUrl).href;
  if (!isAppUrl(url, appUrl)) return;
  if (!window || window.isDestroyed()) createWindow();
  await loadApp(window!, url);
  showMain();
}
const receiptSchema = Schema.Struct({
  files: Schema.Array(LibraryFile).check(Schema.isMaxLength(1000)),
  skipped: Schema.Array(
    Schema.Struct({
      title: Schema.String.check(Schema.isMaxLength(2000)),
      reason: Schema.String.check(Schema.isMaxLength(2000)),
    }),
  ).check(Schema.isMaxLength(1000)),
  blocked: Schema.Array(
    Schema.Struct({
      title: Schema.String.check(Schema.isMaxLength(2000)),
      category: BlockedCategory,
    }),
  ).check(Schema.isMaxLength(1000)),
});
ipcMain.handle("avenire:capture-receipt", (event, id: unknown, receipt: unknown) => {
  if (
    !trustedSender(event) ||
    !captureReady ||
    !captureOwner ||
    !captureOverlay ||
    id !== captureOverlay.state?.id ||
    captureOwner !== captureOverlay.owner
  )
    return;
  const decoded: CaptureReceiptSummary = Schema.decodeUnknownSync(receiptSchema)(receipt);
  captureDiagnostic("Receipt", {
    saved: decoded.files.length,
    skipped: decoded.skipped.length,
    blocked: decoded.blocked.length,
  });
  updateCaptureOverlay((overlay) => overlay.receipt(captureOwner!, String(id), decoded));
});
ipcMain.handle("avenire:capture-failed", (event, id: unknown, message: unknown) => {
  if (
    !trustedSender(event) ||
    !captureReady ||
    !captureOwner ||
    typeof id !== "string" ||
    typeof message !== "string"
  )
    return;
  captureLog("App submission failed", {
    message: typeof message === "string" ? message : "unknown",
  });
  updateCaptureOverlay((overlay) => overlay.failed(captureOwner!, id, message.slice(0, 500)));
});
function overlaySender(event: Electron.IpcMainInvokeEvent): CaptureOverlay {
  if (!captureOverlay?.trusted(event)) throw new Error("Untrusted capture overlay IPC sender");
  return captureOverlay;
}
function overlayOwner(overlay: CaptureOverlay): string | undefined {
  return captureReady && captureOwner === overlay.owner ? captureOwner : undefined;
}
ipcMain.handle("avenire:overlay-ready", (event) => overlaySender(event).sendState());
ipcMain.handle("avenire:overlay-hovered", (event, hovered: unknown) => {
  const overlay = overlaySender(event);
  if (typeof hovered === "boolean") overlay.setHovered(hovered);
});
ipcMain.handle("avenire:overlay-dismissed", (event, id: unknown) => {
  const overlay = overlaySender(event);
  if (typeof id === "string") overlay.dismissed(id);
});
ipcMain.handle("avenire:overlay-resize", (event, height: unknown) => {
  const overlay = overlaySender(event);
  if (typeof height === "number" && Number.isFinite(height) && height > 0) overlay.resize(height);
});
ipcMain.handle("avenire:overlay-undo", async (event, id: unknown, fileId: unknown) => {
  const overlay = overlaySender(event);
  const owner = overlayOwner(overlay);
  const state = overlay.state;
  if (
    !owner ||
    !state ||
    id !== state.id ||
    typeof fileId !== "string" ||
    !window ||
    window.isDestroyed()
  )
    return;
  const captured =
    state.receipt?.files.some((file) => file.id === fileId) ||
    state.items.some((item) => item.status === "saved" && item.file?.id === fileId);
  if (!captured || state.undoneFileIds?.includes(fileId)) return;
  const fetch = await captureUploadSession(window.webContents.session, appUrl, owner);
  if (overlayOwner(overlay) !== owner || overlay.state?.id !== id)
    throw new Error("Your capture changed. Try again.");
  await captureLibraryClient(appUrl, fetch).trash(fileId);
  if (overlayOwner(overlay) !== owner || overlay.state?.id !== id) return;
  overlay.removeFile(owner, id, fileId);
  window.webContents.send("avenire:capture-action", {
    type: "undone",
    captureId: id,
    fileIds: [fileId],
  });
});
ipcMain.handle("avenire:overlay-open", async (event, id: unknown) => {
  const overlay = overlaySender(event);
  const owner = overlayOwner(overlay);
  if (
    !owner ||
    typeof id !== "string" ||
    !overlay.state?.receipt?.files.some((file) => file.id === id)
  )
    return;
  const file = overlay.state.receipt.files.find((file) => file.id === id)!;
  const plan = planReopen(file.origin ?? null, {
    fileId: file.id,
    desktop: true,
    deviceId,
    extension: extensionChannel?.connected() ?? false,
  })[0];
  const result = await reopenForOwner(owner, id, plan);
  if (!result.ok && captureReady && captureOwner === owner)
    await showAppRoute(`/sources/${encodeURIComponent(id)}`);
});
ipcMain.handle("avenire:overlay-sources", (event) => {
  const overlay = overlaySender(event);
  if (overlayOwner(overlay)) return showAppRoute("/?tab=sources");
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
      // Availability is only established by the explicit registration action.
      // Probing here can open a Wayland portal dialog on every status refresh.
      capture: requestedShortcuts.capture === requestedShortcuts.prompt,
      prompt: requestedShortcuts.capture === requestedShortcuts.prompt,
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
    body: "You’ll hear from Ava when your morning report is ready.",
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

/** Native controls belong only to the current, top-frame prompt document. */
function trustedPrompt(event: Electron.IpcMainInvokeEvent): boolean {
  return (
    !!promptWindow &&
    trustedSender(event, promptWindow) &&
    new URL(event.senderFrame!.url).pathname === "/prompt"
  );
}
function currentNative(event: Electron.IpcMainInvokeEvent, id: unknown): NativeOverlay | undefined {
  if (!trustedPrompt(event)) throw new Error("Untrusted native overlay IPC sender");
  if (id !== promptGeneration || !promptWindow?.isVisible())
    throw new Error("Stale native overlay session");
  return nativeOverlay;
}
ipcMain.handle("avenire:prompt-capture-context", async (event) => {
  if (!trustedPrompt(event)) throw new Error("Untrusted native overlay IPC sender");
  if (promptCaptureContext.capture) {
    const generation = promptGeneration;
    try {
      const permission = await promptScreenPermission(event, generation);
      if (!permission.enabled || permission.sessionId !== promptScreenSession) endNativePrompt();
    } catch (error) {
      if (generation === promptGeneration) endNativePrompt();
      throw error;
    }
  }
  return promptCaptureContext;
});
// Capability discovery never starts Qt, inspects a display or acquires pixels.
// Consent is deliberately not a capability: disabled reads return an actionable result.
ipcMain.handle(
  "avenire:native-overlay-available",
  (event) => trustedPrompt(event) && !!promptWindow?.isVisible() && !!nativeOverlayConfig?.enabled,
);
async function promptScreenPermission(event: Electron.IpcMainInvokeEvent, id: unknown) {
  currentNative(event, id);
  if (!nativeOverlayConfig?.enabled) throw new Error("Screen capture disabled by operator");
  const owner = captureOwner;
  const permission = await screenSharingPermission(event.sender.session, appUrl, owner);
  currentNative(event, id);
  if (captureOwner !== owner) throw new Error("Your account changed. Reopen the prompt.");
  return permission;
}
// Only the active prompt may request local pixels, and only through the client tool.
ipcMain.handle("avenire:read-screen", async (event, id: unknown) => {
  currentNative(event, id); // Validate the active prompt before spawning a child.
  if (promptCaptureRunning) throw new Error("Local screen capture already running");
  promptCaptureRunning = true;
  promptCaptureInvalidated = false;
  try {
    promptCaptureContext = { sessionId: promptGeneration, capture: null };
    const permission = await promptScreenPermission(event, id);
    if (!permission.enabled) {
      endNativePrompt();
      return {
        status: "disabled" as const,
        message:
          "Screen sharing is off. Enable Share screen with Ava in Settings → Capture to let me explain what’s on your screen." as const,
      };
    }
    // Bind each permitted read to the display under the cursor now. Pointer
    // movement during asynchronous work must not silently switch this snapshot.
    const pointer = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(pointer);
    const area = { ...display.bounds };
    const inside =
      pointer.x >= area.x &&
      pointer.x < area.x + area.width &&
      pointer.y >= area.y &&
      pointer.y < area.y + area.height;
    if (!inside) throw new Error("The cursor is not on an available display");
    const verifyDisplay = () => {
      if (promptCaptureInvalidated)
        throw new Error("Screen changed during capture; request a fresh screen read");
      if (!displayStillPresent(display.id, area, screen.getAllDisplays()))
        throw new Error("The selected display changed; request a fresh screen read");
    };
    promptScreenSession = permission.sessionId;
    const verify = async () => {
      const latest = await promptScreenPermission(event, id);
      if (!latest.enabled || latest.sessionId !== permission.sessionId)
        throw new Error("Screen-sharing permission revoked or account changed");
    };
    clearInterval(screenPermissionTimer);
    let checkingPermission = false;
    screenPermissionTimer = setInterval(() => {
      // A slow permission endpoint must not accumulate concurrent background requests.
      if (checkingPermission) return;
      checkingPermission = true;
      void verify()
        .catch(() => {
          if (id === promptGeneration) hidePrompt();
        })
        .finally(() => {
          checkingPermission = false;
        });
    }, 5000);
    if (process.platform === "linux" && isWayland) {
      const target = promptWindow!;
      // DISPLAY can identify only XWayland, whose geometry is not proof of the
      // compositor's capture space. Bind this read to a named compositor output.
      const output = await readWaylandOutput(area);
      const verifyOutput = async () => {
        if (!sameWaylandOutput(output, await readWaylandOutput(area)))
          throw new Error("Wayland output changed during capture; request a fresh screen read");
      };
      currentNative(event, id);
      await ensureNativePrompt(area);
      currentNative(event, id);
      const selectedOverlay = nativeOverlay!;
      const selectedScreenId = promptNativeScreenId!;
      verifyDisplay();
      await verify();
      const opacity = target.getOpacity();
      const existingOverlay = nativeOverlay;
      const existingScreenId = promptNativeScreenId;
      let overlayRestored = false;
      try {
        if (existingOverlay && existingScreenId) await existingOverlay.request("suspend_capture");
        target.setOpacity(0);
        await new Promise((resolve) => setTimeout(resolve, 150));
        currentNative(event, id);
        await verifyOutput();
        await verify();
        if (currentNative(event, id) !== selectedOverlay)
          throw new Error("Stale native overlay session");
        verifyDisplay();
        const { stdout } = await promisify(execFile)("grim", ["-c", "-o", output.name, "-"], {
          encoding: "buffer",
          timeout: 5000,
          maxBuffer: 32 * 1024 * 1024,
        });
        currentNative(event, id);
        if (nativeOverlay !== selectedOverlay || promptNativeScreenId !== selectedScreenId)
          throw new Error("Stale native display selection");
        await verify();
        let image = nativeImage.createFromBuffer(stdout);
        if (image.isEmpty()) throw new Error("Screen capture unavailable");
        let size = image.getSize();
        if (Math.max(size.width, size.height) > 1280)
          image = image.resize({
            width: Math.max(1, Math.round((size.width * 1280) / Math.max(size.width, size.height))),
            height: Math.max(
              1,
              Math.round((size.height * 1280) / Math.max(size.width, size.height)),
            ),
          });
        let png = image.toPNG();
        while (png.length > 786000 && image.getSize().width > 100 && image.getSize().height > 100) {
          size = image.getSize();
          image = image.resize({
            width: Math.max(1, Math.floor(size.width * 0.8)),
            height: Math.max(1, Math.floor(size.height * 0.8)),
          });
          png = image.toPNG();
        }
        if (png.length > 786000) throw new Error("Screen image exceeds payload budget");
        size = image.getSize();
        const capturedAt = new Date().toISOString();
        const inBounds =
          pointer.x >= area.x &&
          pointer.x < area.x + area.width &&
          pointer.y >= area.y &&
          pointer.y < area.y + area.height;
        const frame = target.getBounds();
        const left = Math.max(0, Math.min(1, (frame.x - area.x) / area.width));
        const top = Math.max(0, Math.min(1, (frame.y - area.y) / area.height));
        const right = Math.max(left, Math.min(1, (frame.x + frame.width - area.x) / area.width));
        const bottom = Math.max(top, Math.min(1, (frame.y + frame.height - area.y) / area.height));
        await selectedOverlay.request("resume_capture", {
          fresh: true,
          excludedRegion: {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          },
        });
        overlayRestored = true;
        const { presentation } = await readNativeObservation(selectedOverlay, selectedScreenId);
        if (currentNative(event, id) !== selectedOverlay)
          throw new Error("Stale native overlay session");
        await verifyOutput();
        await verify();
        if (currentNative(event, id) !== selectedOverlay)
          throw new Error("Stale native overlay session");
        verifyDisplay();
        const screenId = selectedScreenId;
        promptCaptureContext = {
          sessionId: promptGeneration,
          capture: {
            mimeType: "image/png",
            data: png.toString("base64"),
            width: size.width,
            height: size.height,
            screenId,
            capturedAt,
            cursor: {
              globalX: pointer.x,
              globalY: pointer.y,
              screenId,
              inBounds,
              ...(inBounds
                ? { x: (pointer.x - area.x) / area.width, y: (pointer.y - area.y) / area.height }
                : {}),
              observedAt: capturedAt,
            },
            ...(presentation ? { presentation } : {}),
          },
        };
        return promptCaptureContext;
      } finally {
        if (
          !overlayRestored &&
          existingOverlay &&
          existingScreenId &&
          nativeOverlay === existingOverlay &&
          !target.isDestroyed()
        )
          void existingOverlay
            .request("resume_capture", { fresh: false })
            .catch((error) => captureLog("native-presentation-restore-error", captureError(error)));
        if (id === promptGeneration && !target.isDestroyed()) target.setOpacity(opacity);
      }
    }
    await ensureNativePrompt(area);
    const native = currentNative(event, id);
    if (!native || !promptNativeScreenId) throw new Error("Local screen capture unavailable");
    const target = promptWindow!;
    const opacity = target.getOpacity();
    try {
      // Opacity preserves visibility/session and avoids blur/hide teardown during capture.
      target.setOpacity(0);
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (currentNative(event, id) !== native) throw new Error("Stale native overlay session");
      const frame = target.getBounds();
      const left = Math.max(0, Math.min(1, (frame.x - area.x) / area.width));
      const top = Math.max(0, Math.min(1, (frame.y - area.y) / area.height));
      const right = Math.max(left, Math.min(1, (frame.x + frame.width - area.x) / area.width));
      const bottom = Math.max(top, Math.min(1, (frame.y + frame.height - area.y) / area.height));
      await verify();
      verifyDisplay();
      const capture = await native.capture(promptNativeScreenId, {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
      const observation = await readNativeObservation(native, capture.screenId);
      if (currentNative(event, id) !== native) throw new Error("Stale native overlay session");
      await verify();
      verifyDisplay();
      promptCaptureContext = {
        sessionId: promptGeneration,
        capture: { ...capture, ...observation },
      };
      return promptCaptureContext;
    } finally {
      if (id === promptGeneration && !target.isDestroyed()) target.setOpacity(opacity);
    }
  } catch (error) {
    if (id === promptGeneration) endNativePrompt();
    throw error;
  } finally {
    promptCaptureRunning = false;
  }
});
async function readWaylandOutput(area: Electron.Rectangle) {
  let value: unknown;
  try {
    const { stdout } = await promisify(execFile)("hyprctl", ["monitors", "-j"], {
      encoding: "utf8",
      timeout: 1500,
      maxBuffer: 256 * 1024,
    });
    value = JSON.parse(stdout);
  } catch {
    throw new Error("Wayland screen mapping requires an available Hyprland monitor inventory");
  }
  return matchHyprlandOutput(area, value);
}

async function readNativeObservation(native: NativeOverlay, screenId?: string) {
  const [position, raw] = await Promise.all([
    native.request("get_cursor", screenId ? { screenId } : {}),
    native.request("inspect"),
  ]);
  const cursor = Schema.decodeUnknownSync(DesktopCursorPosition)(position);
  const state = raw as Record<string, unknown>;
  const rotation = state.rotation as { x: number; y: number };
  return Schema.decodeUnknownSync(DesktopNativeObservation)({
    cursor,
    presentation: {
      mode: state.visualizationMode,
      visible: state.visualizationVisible,
      interactive: state.visualizationInteractive,
      title: state.sceneTitle,
      ...(state.visualizationMode === "cart-pole" ? { diagram: state.diagram } : {}),
      rotationX: rotation.x,
      rotationY: rotation.y,
      observedAt: cursor.observedAt,
    },
  });
}
ipcMain.handle("avenire:native-observation", async (event, id: unknown) => {
  const native = currentNative(event, id);
  if (!native) throw new Error("Native overlay unavailable");
  const observation = await readNativeObservation(native, promptCaptureContext.capture?.screenId);
  if (currentNative(event, id) !== native) throw new Error("Stale native overlay session");
  return observation;
});

ipcMain.handle("avenire:native-overlay-state", async (event, id: unknown, value: unknown) => {
  const native = currentNative(event, id);
  const state = Schema.decodeUnknownSync(DesktopOverlayState)(value);
  // Completion clears the thinking indicator while explanations remain until dismissal.
  await native?.request("set_state", {
    phase: promptCaptureContext.capture && state.phase === "thinking" ? "thinking" : "idle",
    reducedMotion: state.reducedMotion,
  });
});
ipcMain.handle("avenire:native-overlay-annotate", async (event, id: unknown, value: unknown) => {
  const native = currentNative(event, id);
  if (!native) throw new Error("Native overlay unavailable");
  if (!Array.isArray(value) || value.length > 128) throw new Error("Invalid overlay annotations");
  const ids = new Set<string>();
  const items = value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid annotation");
    const annotation = Schema.decodeUnknownSync(DesktopOverlayAnnotation)(item);
    if (!annotation.id || ids.has(annotation.id)) throw new Error("Invalid annotation id");
    ids.add(annotation.id);
    if (annotation.x + (annotation.width ?? 0) > 1 || annotation.y + (annotation.height ?? 0) > 1)
      throw new Error("Annotation exceeds display");
    if (annotation.text && annotation.text.length > 512) throw new Error("Invalid annotation text");
    if (annotation.color && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(annotation.color))
      throw new Error("Invalid annotation color");
    return annotation;
  });
  await native?.request("annotate", { items });
});
ipcMain.handle("avenire:native-overlay-clear", async (event, id: unknown) => {
  await currentNative(event, id)?.request("clear");
});
ipcMain.handle(
  "avenire:native-overlay-visualize",
  async (
    event,
    id: unknown,
    visible: unknown,
    interactive: unknown,
    scene: unknown,
    diagram: unknown,
  ) => {
    const native = currentNative(event, id);
    if (
      typeof visible !== "boolean" ||
      (interactive !== undefined && typeof interactive !== "boolean")
    )
      throw new Error("Invalid visualization state");
    if (scene !== undefined && diagram !== undefined)
      throw new Error("Choose one presentation type");
    await native?.request("visualize", {
      visible,
      interactive: interactive ?? false,
      ...(scene === undefined
        ? {}
        : { scene: Schema.decodeUnknownSync(DesktopNativeScene)(scene) }),
      ...(diagram === undefined
        ? {}
        : { diagram: Schema.decodeUnknownSync(DesktopNativeDiagram)(diagram) }),
    });
  },
);

ipcMain.handle("avenire:hide-prompt", (event) => {
  if (!trustedPrompt(event)) throw new Error("Untrusted desktop IPC sender");
  hidePrompt();
});
ipcMain.handle("avenire:set-prompt-busy", (event, busy: unknown) => {
  if (!trustedPrompt(event)) throw new Error("Untrusted desktop IPC sender");
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
  hidePrompt();
  return true;
});

app.on("before-quit", () => {
  quitting = true;
  endNativePrompt();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  activeCapture?.controller.abort();
  stopForegroundPoll?.();
  stopNativePoll?.();
  captureOverlay?.dispose();
  stopTabsReceiver();
  desktopAuth?.close();
  tray?.destroy();
});
