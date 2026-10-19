import { expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const session = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() };
  const windows: Array<{
    options: Record<string, any>;
    webContents: {
      session: typeof session;
      mainFrame: { url: string };
      send: ReturnType<typeof vi.fn>;
      setWindowOpenHandler: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
    };
    isDestroyed: () => boolean;
  }> = [];
  const ipc = new Map<string, (...args: any[]) => unknown>();
  return {
    session,
    windows,
    ipc,
    openExternal: vi.fn(),
    collect: vi.fn(async () => ({
      id: "capture",
      capturedAt: "2026-01-01T00:00:00.000Z",
      deviceId: "test",
      platform: "linux",
      windows: [],
      tabs: [],
      media: [],
      collectorNotes: ["secret"],
      selectionText: "secret",
    })),
  };
});
vi.mock("./config.ts", () => ({
  appUrl: "https://app.avenire.space",
  defaultCaptureShortcut: "Ctrl+Shift+Space",
}));
vi.mock("./capture/collect.ts", () => ({ collectSnapshot: mocks.collect }));
vi.mock("./capture/tabs.ts", () => ({ startTabsReceiver: vi.fn() }));
vi.mock("electron", () => ({
  app: {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: class {
    options;
    webContents = {
      session: mocks.session,
      mainFrame: { url: "https://app.avenire.space/inbox" },
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    };
    constructor(options: Record<string, any>) {
      this.options = options;
      mocks.windows.push(this);
    }
    isDestroyed = () => false;
    loadURL = vi.fn(async () => {});
    on = vi.fn();
    show = vi.fn();
    showInactive = vi.fn();
  },
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) =>
      mocks.ipc.set(channel, handler),
  },
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createEmpty: vi.fn() },
  shell: { openExternal: mocks.openExternal },
  Tray: class {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
  },
}));

it("opens authenticated assets without preload and rejects iframe/foreign IPC", async () => {
  await import("./main.ts");
  await Promise.resolve();
  const main = mocks.windows[0]!;
  const open = main.webContents.setWindowOpenHandler.mock.calls[0]![0];
  expect(open({ url: "https://app.avenire.space/a/token.signature" })).toEqual({ action: "deny" });
  const asset = mocks.windows[1]!;
  expect(asset.options.webPreferences.session).toBe(main.webContents.session);
  expect(asset.options.webPreferences.preload).toBeUndefined();
  expect(asset.options.webPreferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  open({ url: "https://app.avenire.space/settings" });
  open({ url: "file:///private/secret" });
  expect(mocks.windows).toHaveLength(2);
  expect(mocks.openExternal).not.toHaveBeenCalled();
  open({ url: "https://example.com/notes" });
  expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/notes");
  const setShortcut = mocks.ipc.get("avenire:set-shortcut")!;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  expect(setShortcut({ ...trusted, senderFrame: { url: trusted.senderFrame.url } }, "Ctrl+A")).toBe(
    false,
  );
  expect(setShortcut({ ...trusted, sender: asset.webContents }, "Ctrl+A")).toBe(false);
  expect(setShortcut(trusted, "Ctrl+A")).toBe(true);
  const capture = mocks.ipc.get("avenire:capture-now")!;
  expect(() => capture({ ...trusted, senderFrame: null })).toThrow("Untrusted");
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  const delivered = main.webContents.send.mock.calls[0]![1];
  expect(JSON.stringify(delivered)).not.toContain("secret");
});
