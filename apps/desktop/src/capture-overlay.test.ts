import { afterEach, expect, it, vi } from "vite-plus/test";
import type { CaptureReceiptSummary } from "./bridge.ts";
const mocks = vi.hoisted(() => ({ windows: [] as any[], cursor: { x: -50, y: 100 } }));
vi.mock("electron", () => ({
  screen: {
    getCursorScreenPoint: () => mocks.cursor,
    getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 40, width: 1920, height: 1040 } }),
  },
  BrowserWindow: class {
    options: any;
    webContents = {
      send: vi.fn(),
      mainFrame: { url: "" },
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    constructor(options: any) {
      this.options = options;
      mocks.windows.push(this);
    }
    on = vi.fn();
    setMenu = vi.fn();
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    setBounds = vi.fn();
    showInactive = vi.fn();
    hide = vi.fn();
    destroy = vi.fn();
    getBounds = () => ({ x: -408, y: 896, width: 404, height: 180 });
    isDestroyed = () => false;
    loadFile = vi.fn(async () => {});
  },
}));
import { CaptureOverlay, overlayBounds } from "./capture-overlay.ts";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.cursor = { x: -50, y: 100 };
});
const start = {
  id: "capture",
  items: [{ key: "tab:1", title: "Lecture", kind: "pdf", status: "pending" as const }],
};
const receipt: CaptureReceiptSummary = { files: [], skipped: [], blocked: [] };
it("creates a nonfocusing, sandboxed overlay at the cursor display's bottom-right", () => {
  const overlay = new CaptureOverlay("/tmp/capture-overlay.html", "/tmp/overlay-preload.cjs");
  const target = mocks.windows.at(-1)!;
  expect(target.options).toMatchObject({
    width: 404,
    x: -408,
    y: 896,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  expect(target.setMenu).toHaveBeenCalledWith(null);
  expect(target.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, {
    visibleOnFullScreen: true,
  });
  expect(target.setAlwaysOnTop).toHaveBeenCalledWith(
    true,
    process.platform === "darwin" ? "screen-saver" : "floating",
  );
  overlay.begin("alice", start);
  overlay.resize(300);
  expect(target.setBounds).toHaveBeenLastCalledWith({ x: -408, y: 776, width: 404, height: 300 });
  expect(target.showInactive).toHaveBeenCalled();
  expect(overlayBounds({ x: 0, y: 0, width: 800, height: 600 }, 10000).height).toBe(592);
  overlay.dispose();
});
it("accepts IPC only from its own main frame and exact bundled URL", () => {
  const overlay = new CaptureOverlay("/tmp/capture-overlay.html", "/tmp/overlay-preload.cjs");
  const target = mocks.windows.at(-1)!;
  target.webContents.mainFrame.url = overlay.url;
  const event = {
    sender: target.webContents,
    senderFrame: target.webContents.mainFrame,
  } as Electron.IpcMainInvokeEvent;
  expect(overlay.trusted(event)).toBe(true);
  expect(
    overlay.trusted({ ...event, senderFrame: { url: overlay.url } } as Electron.IpcMainInvokeEvent),
  ).toBe(false);
  expect(overlay.trusted({ ...event, sender: {} } as Electron.IpcMainInvokeEvent)).toBe(false);
  target.webContents.mainFrame.url = `${overlay.url}?untrusted=1`;
  expect(overlay.trusted(event)).toBe(false);
  overlay.dispose();
});
it("streams owner-bound state, waits eight seconds and dismisses only after the exit animation", async () => {
  vi.useFakeTimers();
  const overlay = new CaptureOverlay("/tmp/capture-overlay.html", "/tmp/overlay-preload.cjs");
  const target = mocks.windows.at(-1)!;
  overlay.begin("alice", start, "Ctrl+Shift+Space");
  overlay.progress("bob", { id: "capture", seq: 1, key: "tab:1", status: "saved" });
  expect(overlay.state?.items[0]?.status).toBe("pending");
  overlay.progress("alice", { id: "capture", seq: 1, key: "tab:1", status: "uploading" });
  expect(overlay.state?.items[0]?.title).toBe("Lecture");
  overlay.receipt("alice", "capture", receipt);
  expect(overlay.state?.phase).toBe("collecting");
  overlay.submitting("alice", "capture");
  overlay.receipt("alice", "capture", receipt);
  expect(overlay.state?.phase).toBe("done");
  await vi.advanceTimersByTimeAsync(7999);
  expect(overlay.state?.closing).not.toBe(true);
  mocks.cursor = { x: -100, y: 950 };
  overlay.setHovered(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(overlay.state?.closing).not.toBe(true);
  expect(target.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, {});
  mocks.cursor = { x: 0, y: 0 };
  overlay.setHovered(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(overlay.state?.closing).toBe(true);
  expect(target.hide).not.toHaveBeenCalled();
  overlay.dismissed();
  expect(target.hide).toHaveBeenCalledOnce();
  overlay.begin("bob", { ...start, id: "new" });
  overlay.receipt("alice", "capture", receipt);
  overlay.dismissed();
  expect(target.hide).toHaveBeenCalledOnce();
  expect(overlay.state).toMatchObject({ id: "new", phase: "collecting" });
  overlay.clear();
  expect(overlay.owner).toBeUndefined();
  expect(overlay.state).toBeUndefined();
});
it("reports failures and cancels a previous capture's timeout", async () => {
  vi.useFakeTimers();
  const overlay = new CaptureOverlay("/tmp/capture-overlay.html", "/tmp/overlay-preload.cjs");
  overlay.begin("alice", start);
  overlay.failed("alice", "capture", "Try again");
  expect(overlay.state).toMatchObject({ phase: "failed", error: "Try again" });
  overlay.begin("alice", { ...start, id: "next" });
  await vi.advanceTimersByTimeAsync(10000);
  expect(overlay.state?.closing).not.toBe(true);
  overlay.dispose();
});
it("hides a completed receipt after the renderer's manual exit animation", () => {
  const overlay = new CaptureOverlay("/tmp/capture-overlay.html", "/tmp/overlay-preload.cjs");
  const target = mocks.windows.at(-1)!;
  overlay.begin("alice", start);
  overlay.submitting("alice", "capture");
  overlay.receipt("alice", "capture", receipt);
  overlay.setHovered(true);
  overlay.dismissed();
  expect(target.hide).toHaveBeenCalledOnce();
  expect(target.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  overlay.dispose();
});

it("bounds small work areas and gives the renderer the available height", () => {
  expect(overlayBounds({ x: 100, y: 50, width: 300, height: 200 }, 900)).toEqual({
    x: 104,
    y: 54,
    width: 292,
    height: 192,
  });
  const overlay = new CaptureOverlay("/tmp/overlay.html", "/tmp/preload.cjs");
  overlay.begin("alice", start);
  expect(overlay.state?.maxHeight).toBe(1032);
  overlay.dispose();
});
it("polls Linux cursor bounds only while visible and toggles click-through", async () => {
  vi.useFakeTimers();
  vi.spyOn(process, "platform", "get").mockReturnValue("linux");
  const overlay = new CaptureOverlay("/tmp/overlay.html", "/tmp/preload.cjs");
  const target = mocks.windows.at(-1)!;
  overlay.begin("alice", start);
  mocks.cursor = { x: -100, y: 950 };
  await vi.advanceTimersByTimeAsync(100);
  expect(target.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, {});
  mocks.cursor = { x: 0, y: 0 };
  await vi.advanceTimersByTimeAsync(100);
  expect(target.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  overlay.clear();
  const calls = target.setIgnoreMouseEvents.mock.calls.length;
  mocks.cursor = { x: -100, y: 950 };
  await vi.advanceTimersByTimeAsync(1000);
  expect(target.setIgnoreMouseEvents).toHaveBeenCalledTimes(calls);
  overlay.dispose();
  vi.restoreAllMocks();
});
