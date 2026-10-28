import { captureLog } from "./capture/diagnostics.ts";
import { BrowserWindow, screen } from "electron";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAPTURE_TOAST_VISIBLE_MS } from "./bridge.ts";
import type {
  CaptureOverlayState,
  CaptureStarted,
  CaptureProgress,
  CaptureReceiptSummary,
} from "./bridge.ts";

/** A partial or older installation must leave the in-app toast enabled. */
export function captureOverlayAssetsAvailable(directory: string): boolean {
  return ["capture-overlay.html", "capture-overlay.js", "capture-overlay.css"].every((name) =>
    existsSync(join(directory, name)),
  );
}

/** A 380px panel inside a 12px transparent gutter (room for its slide-in), 16px off the corner. */
const PANEL_WIDTH = 380;
const GUTTER = 12;
const MARGIN = 16 - GUTTER;
export function overlayBounds(area: Electron.Rectangle, height: number) {
  const width = Math.max(1, Math.min(PANEL_WIDTH + GUTTER * 2, area.width - MARGIN * 2));
  const boundedHeight = Math.max(
    1,
    Math.min(Math.ceil(height), Math.max(1, area.height - MARGIN * 2)),
  );
  return {
    width,
    height: boundedHeight,
    x: Math.max(area.x, area.x + area.width - width - MARGIN),
    y: area.y + area.height - boundedHeight - MARGIN,
  };
}

/** Main owns the state and lifetime. The renderer can request actions, never supply source data. */
export class CaptureOverlay {
  readonly window: BrowserWindow;
  readonly url: string;
  state: CaptureOverlayState | undefined;
  owner: string | undefined;
  private hovered = false;
  private dismissedCaptureId: string | undefined;
  private hoverPoll: ReturnType<typeof setInterval> | undefined;
  private expires = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private area: Electron.Rectangle;
  constructor(path: string, preload: string) {
    this.url = pathToFileURL(path).href;
    this.area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    this.window = new BrowserWindow({
      ...overlayBounds(this.area, 180),
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        preload,
        partition: "avenire-capture-overlay",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    this.window.on("hide", () => this.stopHoverPoll());
    this.window.on("closed", () => this.stopHoverPoll());
    this.window.setMenu(null);
    this.window.setAlwaysOnTop(true, process.platform === "darwin" ? "screen-saver" : "floating");
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", (event) => event.preventDefault());
    this.window.webContents.on("will-redirect", (event) => event.preventDefault());
    this.window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    this.window.webContents.on("did-fail-load", (_event, code, _description, _url, mainFrame) => {
      if (mainFrame) captureLog("Overlay page failed to load", { code });
    });
    this.window.webContents.on("render-process-gone", (_event, details) => {
      captureLog("Overlay renderer stopped", { reason: details.reason });
    });
    this.window.webContents.on("console-message", (event) => {
      if (event.level !== "error") return;
      // Forward the bundled renderer's errors; redact URLs, including private bundle paths.
      const message = event.message.slice(0, 8000);
      captureLog("Overlay renderer error", { message });
    });
    this.window.webContents.on("did-finish-load", () => {
      captureLog("Overlay page loaded");
      this.push();
      if (this.state && this.dismissedCaptureId !== this.state.id) this.window.showInactive();
    });
    void this.window.loadFile(path).catch(() => {
      captureLog("Overlay could not open its bundled page");
    });
  }
  trusted(event: Electron.IpcMainInvokeEvent): boolean {
    return (
      !this.window.isDestroyed() &&
      event.sender === this.window.webContents &&
      event.senderFrame === this.window.webContents.mainFrame &&
      event.senderFrame.url === this.url
    );
  }
  private cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private push() {
    if (this.state && !this.window.isDestroyed())
      this.window.webContents.send("avenire:overlay-state", this.state);
  }
  sendState() {
    this.push();
  }
  begin(owner: string, started: CaptureStarted, shortcut?: string) {
    this.cancelTimer();
    this.expires = 0;
    this.hovered = false;
    this.owner = owner;
    this.dismissedCaptureId = undefined;
    this.area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    this.state = {
      maxHeight: overlayBounds(this.area, Infinity).height,
      id: started.id,
      phase: "collecting",
      items: started.items,
      ...(shortcut ? { shortcut } : {}),
    };
    this.resize(this.window.getBounds().height);
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.push();
    this.window.showInactive();
    this.startHoverPoll();
  }
  progress(owner: string, event: CaptureProgress) {
    if (owner !== this.owner || event.id !== this.state?.id || this.state.phase !== "collecting")
      return;
    if (event.file && this.state.undoneFileIds?.includes(event.file.id)) return;
    const items = [...this.state.items];
    const index = items.findIndex((item) => item.key === event.key);
    const { id: _id, seq: _seq, ...update } = event;
    const item = { ...(items[index] ?? { title: event.title ?? "Captured source" }), ...update };
    if (index < 0) items.push(item);
    else items[index] = item;
    this.state = { ...this.state, items };
    this.push();
  }
  submitting(owner: string, id: string) {
    if (owner !== this.owner || id !== this.state?.id) return;
    this.cancelTimer();
    this.expires = 0;
    const { error: _error, receipt: _receipt, ...state } = this.state;
    this.state = { ...state, phase: "submitting", closing: false };
    this.push();
    if (this.dismissedCaptureId !== id) this.window.showInactive();
  }
  receipt(owner: string, id: string, receipt: CaptureReceiptSummary) {
    if (owner !== this.owner || id !== this.state?.id || this.state.phase !== "submitting") return;
    this.state = {
      ...this.state,
      phase: "done",
      receipt: {
        ...receipt,
        files: receipt.files.filter((file) => !this.state?.undoneFileIds?.includes(file.id)),
      },
    };
    this.finish();
  }
  failed(owner: string, id: string, error: string) {
    if (owner !== this.owner || id !== this.state?.id || this.state.phase === "done") return;
    this.state = { ...this.state, phase: "failed", error };
    this.finish();
  }
  private finish() {
    this.expires =
      this.dismissedCaptureId === this.state?.id ? 0 : Date.now() + CAPTURE_TOAST_VISIBLE_MS;
    this.push();
    this.arm();
  }
  private arm() {
    this.cancelTimer();
    if (!this.expires || this.hovered) return;
    this.timer = setTimeout(
      () => {
        if (!this.state || this.hovered) return;
        this.state = { ...this.state, closing: true };
        this.push();
      },
      Math.max(0, this.expires - Date.now()),
    );
    this.timer.unref?.();
  }
  private stopHoverPoll() {
    clearInterval(this.hoverPoll);
    this.hoverPoll = undefined;
  }
  private startHoverPoll() {
    this.stopHoverPoll();
    if (process.platform !== "linux") return;
    this.hoverPoll = setInterval(() => {
      if (this.window.isDestroyed()) {
        this.stopHoverPoll();
        return;
      }
      const point = screen.getCursorScreenPoint();
      const bounds = this.window.getBounds();
      const hovered =
        point.x >= bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y < bounds.y + bounds.height;
      if (hovered !== this.hovered) this.setHovered(hovered);
    }, 100);
    this.hoverPoll.unref?.();
  }
  setHovered(hovered: boolean) {
    this.hovered = hovered;
    this.window.setIgnoreMouseEvents(!hovered, hovered ? {} : { forward: true });
    if (hovered && this.state?.closing) {
      this.state = { ...this.state, closing: false };
      this.push();
    }
    this.arm();
  }
  dismissed(id?: string) {
    if (id !== undefined && id !== this.state?.id) return;
    if (this.state) {
      this.dismissedCaptureId = this.state.id;
      this.cancelTimer();
      this.expires = 0;
      this.hovered = false;
      this.window.setIgnoreMouseEvents(true, { forward: true });
      this.stopHoverPoll();
      this.window.hide();
    }
  }
  removeFile(owner: string, id: string, fileId: string) {
    if (owner !== this.owner || this.state?.id !== id) return;
    this.state = {
      ...this.state,
      undoneFileIds: [...new Set([...(this.state.undoneFileIds ?? []), fileId])],
      items: this.state.items.filter((item) => item.file?.id !== fileId),
      ...(this.state.receipt
        ? {
            receipt: {
              ...this.state.receipt,
              files: this.state.receipt.files.filter((file) => file.id !== fileId),
            },
          }
        : {}),
    };
    this.push();
  }
  resize(height: number) {
    if (!this.window.isDestroyed()) this.window.setBounds(overlayBounds(this.area, height));
  }
  clear() {
    this.stopHoverPoll();
    this.cancelTimer();
    this.owner = undefined;
    this.state = undefined;
    this.expires = 0;
    this.hovered = false;
    if (!this.window.isDestroyed()) this.window.hide();
  }
  dispose() {
    this.clear();
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
