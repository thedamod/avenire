import { expect, it, vi } from "vite-plus/test";
import { pathToFileURL } from "node:url";

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
    loadURL: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn<() => void>>;
    focus: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
    setAlwaysOnTop: ReturnType<typeof vi.fn>;
  }> = [];
  const ipc = new Map<string, (...args: any[]) => unknown>();
  return {
    completed: true,
    trayMenu: [] as any[],
    trayEvents: new Map<string, () => void>(),
    saveShortcuts: vi.fn(async () => {}),
    appEvents: new Map<string, (...args: any[]) => unknown>(),
    session,
    windows,
    ipc,
    shortcuts: new Map<string, () => void>(),
    unavailableShortcut: "",
    openExternal: vi.fn(),
    authStart: vi.fn(async () => {}),
    authCompleted: () => {},
    messageBox: vi.fn(async () => ({ response: 1 })),
    showError: vi.fn(),
    collect: vi.fn(async (_capturedAt?: string, _options?: { foreground: boolean }) => ({
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
  defaultPromptShortcut: "Alt+Space",
  fallbackPromptShortcut: "Alt+Shift+Space",
}));
vi.mock("./capture/collect.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture/collect.ts")>()),
  collectSnapshot: mocks.collect,
  instantCapture: (capturedAt: string, foreground: boolean) => {
    const promise = mocks.collect(capturedAt, { foreground });
    return {
      snapshot: {
        id: "capture",
        capturedAt,
        deviceId: "test",
        platform: "linux",
        windows: [],
        tabs: [],
        media: [],
        collectorNotes: [],
      },
      resolve: () => promise,
    };
  },
}));
vi.mock("./capture/native.ts", () => ({
  startNativePoll: () => () => {},
  clearNativeCache: vi.fn(),
}));
vi.mock("./capture/foreground.ts", () => ({ startForegroundPoll: () => () => {} }));
vi.mock("./capture/research/electron/collectors/ps-queue.ts", () => ({
  prewarmPowerShell: async () => {},
}));
vi.mock("./capture/tabs.ts", () => ({
  extensionChannel: undefined,
  resetTabsOwner: vi.fn(),
  startTabsReceiver: vi.fn(),
  stopTabsReceiver: vi.fn(),
  latestTabs: () => [],
  tabsReceiverAvailable: () => true,
}));
vi.mock("./capture/upload.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./capture/upload.ts")>()),
  uploadCapturedFiles: vi.fn(async () => ({ files: [], skipped: [] })),
}));
vi.mock("./capture/session.ts", () => ({ captureUploadSession: vi.fn(async () => vi.fn()) }));
vi.mock("./auth.ts", () => ({
  DesktopAuth: class {
    constructor(_url: string, _session: unknown, completed: () => void) {
      mocks.authCompleted = completed;
    }
    start = mocks.authStart;
    close = vi.fn();
  },
  isProviderAuthUrl: (url: string) => url.startsWith("https://accounts.google.com/"),
}));
vi.mock("./setup.ts", () => ({
  DesktopSetup: class {
    get completed() {
      return mocks.completed;
    }
    foregroundCapture = true;
    permissions = {
      foregroundAvailable: true,
      accessibility: "not-needed",
      automation: "not-needed",
      foregroundNote: "test",
    };
    saveShortcuts = mocks.saveShortcuts;
    load = vi.fn(async () => {});
    requestPermission = vi.fn(async () => {});
    complete = vi.fn(async () => {
      mocks.completed = true;
    });
  },
}));
vi.mock("electron", () => ({
  app: {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: (event: string, callback: (...args: any[]) => unknown) =>
      mocks.appEvents.set(event, callback),
    getPath: () => "/tmp/avenire-tests",
    quit: vi.fn(),
  },
  BrowserWindow: class {
    options;
    events = new Map<string, (...args: any[]) => unknown>();
    webContents = {
      session: mocks.session,
      mainFrame: { url: "https://app.avenire.space/inbox" },
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      events: new Map<string, (...args: any[]) => unknown>(),
      on: vi.fn(function (this: any, event: string, callback: (...args: any[]) => unknown) {
        this.events.set(event, callback);
      }),
      setBackgroundThrottling: vi.fn(),
    };
    constructor(options: Record<string, any>) {
      this.options = options;
      mocks.windows.push(this);
    }
    isDestroyed = () => false;
    loadURL = vi.fn(async () => {});
    loadFile = vi.fn(async () => {});
    once = vi.fn((event: string, callback: (...args: any[]) => unknown) =>
      this.events.set(event, callback),
    );
    on = vi.fn((event: string, callback: (...args: any[]) => unknown) =>
      this.events.set(event, callback),
    );
    show = vi.fn();
    showInactive = vi.fn();
    focused = false;
    isFocused = () => this.focused;
    focus = vi.fn(() => {
      this.focused = true;
    });
    hide = vi.fn(() => {
      this.focused = false;
    });
    setTitleBarOverlay = vi.fn();
    setBounds = vi.fn();
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    setMenu = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    getBounds = () => ({ width: 380, height: 180 });
    isMinimized = () => false;
    restore = vi.fn();
    destroy = vi.fn();
    close = vi.fn();
  },
  screen: {
    getCursorScreenPoint: () => ({ x: -100, y: 100 }),
    getDisplayNearestPoint: () => ({ workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }),
  },
  globalShortcut: {
    register: vi.fn((accelerator: string, callback: () => void) => {
      if (accelerator === mocks.unavailableShortcut) return false;
      mocks.shortcuts.set(accelerator, callback);
      return true;
    }),
    unregister: vi.fn((accelerator: string) => mocks.shortcuts.delete(accelerator)),
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) =>
      mocks.ipc.set(channel, handler),
  },
  Menu: { buildFromTemplate: vi.fn((template) => template), setApplicationMenu: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({ resize: () => ({ setTemplateImage: vi.fn() }) })) },
  dialog: { showErrorBox: mocks.showError, showMessageBox: mocks.messageBox },
  shell: { openExternal: mocks.openExternal },
  Tray: class {
    setToolTip = vi.fn();
    setContextMenu = vi.fn((menu) => {
      mocks.trayMenu = menu;
    });
    on = vi.fn((event, callback) => {
      mocks.trayEvents.set(event, callback);
    });
    destroy = vi.fn();
  },
}));

it("opens authenticated assets without preload and rejects iframe/foreign IPC", async () => {
  await import("./main.ts");
  await vi.waitFor(() => expect(mocks.windows.length).toBeGreaterThan(0));
  const main = mocks.windows[0]!;
  const open = main.webContents.setWindowOpenHandler.mock.calls[0]![0];
  expect(open({ url: "https://app.avenire.space/a/token.signature" })).toEqual({ action: "deny" });
  const asset = mocks.windows.at(-1)!;
  expect(asset.options.webPreferences.session).toBe(main.webContents.session);
  expect(asset.options.webPreferences.preload).toBeUndefined();
  expect(asset.options.webPreferences).toMatchObject({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  });
  open({ url: "https://app.avenire.space/settings" });
  open({ url: "file:///private/secret" });
  expect(mocks.windows).toHaveLength(3);
  expect(mocks.openExternal).not.toHaveBeenCalled();
  open({ url: "https://example.com/notes" });
  expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/notes");
  const setShortcut = mocks.ipc.get("avenire:set-shortcut")!;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  expect(
    await setShortcut({ ...trusted, senderFrame: { url: trusted.senderFrame.url } }, "Ctrl+A"),
  ).toBe(false);
  expect(await setShortcut({ ...trusted, sender: asset.webContents }, "Ctrl+A")).toBe(false);
  expect(await setShortcut(trusted, "Ctrl+A")).toBe(true);
  const capture = mocks.ipc.get("avenire:capture-now")!;
  expect(() => capture({ ...trusted, senderFrame: null })).toThrow("Untrusted");
  await capture(trusted);
  expect(mocks.collect).not.toHaveBeenCalled();
  mocks.ipc.get("avenire:capture-ready")!(trusted, true, "owner-a");
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  const delivered = main.webContents.send.mock.calls.find(
    ([channel]) => channel === "avenire:capture",
  )![1];
  expect(JSON.stringify(delivered)).not.toContain("secret");
});

it("retains receipts across reloads, requires a matching acknowledgement and isolates account switches", async () => {
  const main = mocks.windows[0]!;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  const ready = mocks.ipc.get("avenire:capture-ready")!;
  const capture = mocks.ipc.get("avenire:capture-now")!;
  await capture(trusted);
  expect(mocks.collect).not.toHaveBeenCalled();
  ready(trusted, false);
  ready(trusted, true, "owner-a");
  expect(main.webContents.send.mock.calls.at(-1)![0]).toBe("avenire:capture");
  mocks.ipc.get("avenire:capture-ack")!(
    { ...trusted, senderFrame: { url: trusted.senderFrame.url } },
    "capture",
  );
  await capture(trusted);
  expect(mocks.collect).not.toHaveBeenCalled();
  mocks.ipc.get("avenire:capture-ack")!(trusted, "capture");
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledTimes(1);
  ready(trusted, false);
  ready(trusted, true, "owner-b");
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledTimes(2);
});

it("uses first paint throttling, hides to tray and bounds renderer recovery", () => {
  const main = mocks.windows[0]! as any;
  expect(main.options).toMatchObject({
    show: false,
    webPreferences: { backgroundThrottling: false },
  });
  main.events.get("ready-to-show")();
  expect(main.webContents.setBackgroundThrottling).toHaveBeenCalledWith(true);
  const preventDefault = vi.fn();
  main.events.get("close")({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  const gone = main.webContents.events.get("render-process-gone");
  main.loadURL.mockClear();
  gone({}, { reason: "oom" });
  gone({}, { reason: "crashed" });
  gone({}, { reason: "crashed" });
  expect(main.loadURL).toHaveBeenCalledTimes(2);
  expect(mocks.showError).toHaveBeenCalledWith("Avenire needs to restart", expect.any(String));
  main.webContents.events.get("will-navigate")(
    { preventDefault },
    "https://accounts.google.com/o/oauth2/auth",
  );
  expect(mocks.authStart).toHaveBeenCalledOnce();
});

it("toggles a reused prompt on the cursor display and keeps a reply on screen through blur", async () => {
  await import("./main.ts");
  const toggle = mocks.shortcuts.get("Alt+Space")!;
  const count = mocks.windows.length;
  toggle();
  const prompt = mocks.windows.at(-1)!;
  expect(mocks.windows).toHaveLength(count + 1);
  expect(prompt.options).toMatchObject({
    frame: false,
    transparent: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
  });
  expect(prompt.options.webPreferences.session).toBe(mocks.windows[0]!.webContents.session);
  expect(prompt.options.webPreferences.preload).toBe(
    mocks.windows[0]!.options.webPreferences.preload,
  );
  expect(prompt.loadURL).toHaveBeenCalledWith("https://app.avenire.space/prompt");
  expect(prompt.setAlwaysOnTop).toHaveBeenCalledWith(true, "floating");
  expect(prompt.setBounds).toHaveBeenCalledWith({ x: -520, y: 620, width: 520, height: 420 });
  expect(prompt.show).toHaveBeenCalledOnce();
  expect(prompt.focus).toHaveBeenCalledOnce();
  expect(prompt.webContents.send).toHaveBeenCalledWith("avenire:prompt-shown");
  toggle();
  expect(prompt.hide).toHaveBeenCalledOnce();
  toggle();
  expect(mocks.windows).toHaveLength(count + 1);
  const trusted = { sender: prompt.webContents, senderFrame: prompt.webContents.mainFrame };
  const setBusy = mocks.ipc.get("avenire:set-prompt-busy")!;
  const blur = prompt.on.mock.calls.find(([event]) => event === "blur")![1];
  setBusy(trusted, true);
  prompt.hide(); // Simulate loss of focus in the mock.
  prompt.hide.mockClear();
  blur();
  expect(prompt.hide).not.toHaveBeenCalled();
  // A finished reply stays on screen until esc; once released, blur hides it.
  setBusy(trusted, false);
  expect(prompt.hide).not.toHaveBeenCalled();
  blur();
  expect(prompt.hide).toHaveBeenCalledOnce();
});

it("openInMain rejects full URLs and untrusted senders, and opens app paths in the main window", async () => {
  await import("./main.ts");
  const main = mocks.windows[0]!;
  const prompt = mocks.windows.at(-1)!;
  const trusted = { sender: prompt.webContents, senderFrame: prompt.webContents.mainFrame };
  const open = mocks.ipc.get("avenire:open-in-main")!;
  main.loadURL.mockClear();
  for (const path of [
    "https://app.avenire.space/chat/1",
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/\n/evil.test",
  ]) {
    expect(await open(trusted, path)).toBe(false);
  }
  expect(await open({ ...trusted, senderFrame: { url: trusted.senderFrame.url } }, "/chat/1")).toBe(
    false,
  );
  expect(main.loadURL).not.toHaveBeenCalled();
  expect(await open(trusted, "/chat/1")).toBe(true);
  expect(main.loadURL).toHaveBeenCalledWith("https://app.avenire.space/chat/1");
  expect(main.show).toHaveBeenCalled();
  expect(main.focus).toHaveBeenCalled();
});

it("uses custom title bars and permits chrome IPC only from the exact application frame", () => {
  const main = mocks.windows[0]! as any;
  expect(main.options).toMatchObject({
    titleBarStyle: "hidden",
    titleBarOverlay: { height: 40 },
    icon: expect.stringContaining("icon.png"),
  });
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  expect(mocks.ipc.get("avenire:window-chrome")!(trusted)).toMatchObject({ height: 40 });
  expect(() =>
    mocks.ipc.get("avenire:window-chrome")!({
      ...trusted,
      senderFrame: { url: trusted.senderFrame.url },
    }),
  ).toThrow("Untrusted");
  expect(() => mocks.ipc.get("avenire:window-theme")!(trusted, "invalid")).toThrow();
  mocks.ipc.get("avenire:window-theme")!(trusted, "light");
  if (process.platform !== "darwin")
    expect(main.setTitleBarOverlay).toHaveBeenCalledWith({
      color: "#fcfcfc",
      symbolColor: "#141414",
      height: 40,
    });
  const prompt = mocks.windows.at(-1)!;
  expect(
    mocks.ipc.get("avenire:window-chrome")!({
      sender: prompt.webContents,
      senderFrame: prompt.webContents.mainFrame,
    }),
  ).toBeNull();
});

it("retries the configured server without exposing its address and ignores cancelled navigation", async () => {
  const main = mocks.windows[0]!;
  main.loadURL.mockClear();
  main.loadURL.mockRejectedValueOnce(
    Object.assign(new Error("aborted"), { code: "ERR_ABORTED", errno: -3 }),
  );
  mocks.authCompleted();
  await vi.waitFor(() => expect(main.loadURL).toHaveBeenCalledOnce());
  expect(mocks.messageBox).not.toHaveBeenCalled();
  main.loadURL.mockClear();
  main.loadURL.mockRejectedValueOnce(
    Object.assign(new Error("ERR_CONNECTION_REFUSED private/server"), {
      code: "ERR_CONNECTION_REFUSED",
    }),
  );
  mocks.messageBox.mockResolvedValueOnce({ response: 0 });
  mocks.authCompleted();
  await vi.waitFor(() => expect(main.loadURL).toHaveBeenCalledTimes(2));
  expect(main.loadURL).toHaveBeenLastCalledWith("https://app.avenire.space");
  const message = JSON.stringify(mocks.messageBox.mock.calls[0]?.slice(1));
  expect(message).not.toContain("private/server");
  expect(message).not.toContain("https://");
});

it("wires tray routes, capture state, and persisted pause without pausing manual actions", async () => {
  const main = mocks.windows[0]! as any;
  const entry = (id: string) => mocks.trayMenu.find((item) => item.id === id)!;
  main.loadURL.mockClear();
  entry("tasks").click();
  expect(main.loadURL).toHaveBeenLastCalledWith("https://app.avenire.space/tasks");
  entry("settings").click();
  expect(main.loadURL).toHaveBeenLastCalledWith("https://app.avenire.space/settings");
  entry("home").click();
  expect(main.loadURL).toHaveBeenLastCalledWith("https://app.avenire.space/");
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  mocks.ipc.get("avenire:capture-ready")!(trusted, false);
  expect(entry("capture").enabled).toBe(false);
  mocks.ipc.get("avenire:capture-ready")!(trusted, true, "tray-owner");
  expect(entry("capture").enabled).toBe(true);
  entry("shortcuts").click();
  await vi.waitFor(() => expect(entry("shortcuts").label).toBe("Resume shortcuts"));
  expect(mocks.saveShortcuts).toHaveBeenLastCalledWith(expect.any(Object), false);
  expect(entry("capture").enabled).toBe(true);
  const setShortcut = mocks.ipc.get("avenire:set-shortcut")!;
  expect(await setShortcut(trusted, "Alt+C")).toBe(true);
  expect(entry("shortcuts").checked).toBe(true);
  expect(entry("capture").accelerator).toBe("Alt+C");
  mocks.unavailableShortcut = "Alt+Space";
  mocks.showError.mockClear();
  entry("shortcuts").click();
  await vi.waitFor(() =>
    expect(mocks.showError).toHaveBeenCalledWith(
      "Shortcuts could not be changed",
      expect.stringContaining("already in use"),
    ),
  );
  expect(entry("shortcuts").checked).toBe(true);
  expect(mocks.shortcuts.has("Alt+C")).toBe(false);
  mocks.unavailableShortcut = "";
  entry("shortcuts").click();
  await vi.waitFor(() => expect(entry("shortcuts").checked).toBe(false));
  expect(mocks.saveShortcuts).toHaveBeenLastCalledWith(
    expect.objectContaining({ capture: "Alt+C" }),
    true,
  );
  if (process.platform !== "darwin") {
    mocks.trayEvents.get("click")!();
    expect(main.focus).toHaveBeenCalled();
  } else expect(mocks.trayEvents.has("click")).toBe(false);
});

it("publishes progress before collection settles, ignores placeholder acks and replays only to its owner", async () => {
  const main = mocks.windows[0]!;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  const ready = mocks.ipc.get("avenire:capture-ready")!;
  const capture = mocks.ipc.get("avenire:capture-now")!;
  const ack = mocks.ipc.get("avenire:capture-ack")!;
  ready(trusted, true, "progress-owner", { readInBrowser: true });
  let settle!: (value: Awaited<ReturnType<typeof mocks.collect>>) => void;
  mocks.collect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  main.webContents.send.mockClear();
  const running = capture(trusted);
  expect(main.webContents.send.mock.calls[0]![0]).toBe("avenire:capture-started");
  expect(main.webContents.send.mock.calls.some(([channel]) => channel === "avenire:capture")).toBe(
    false,
  );
  ack(trusted, "capture");
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledOnce();
  ready(trusted, false);
  ready(trusted, true, "progress-owner", { readInBrowser: true });
  expect(
    main.webContents.send.mock.calls.filter(([channel]) => channel === "avenire:capture-started"),
  ).toHaveLength(2);
  settle({
    id: "capture",
    capturedAt: "now",
    deviceId: "test",
    platform: "linux",
    windows: [],
    tabs: [],
    media: [],
    collectorNotes: [],
    selectionText: "",
  });
  await running;
  expect(
    main.webContents.send.mock.calls.filter(([channel]) => channel === "avenire:capture"),
  ).toHaveLength(1);
  await capture(trusted);
  expect(mocks.collect).toHaveBeenCalledOnce();
  expect(
    main.webContents.send.mock.calls.filter(([channel]) => channel === "avenire:capture"),
  ).toHaveLength(2);
  ack(trusted, "capture");
});

it("drops an in-flight receipt on an account switch and rejects foreign reopen IPC", async () => {
  const main = mocks.windows[0]!;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  const ready = mocks.ipc.get("avenire:capture-ready")!;
  ready(trusted, true, "switch-owner-a");
  let settle!: (value: Awaited<ReturnType<typeof mocks.collect>>) => void;
  mocks.collect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        settle = resolve;
      }),
  );
  main.webContents.send.mockClear();
  const running = mocks.ipc.get("avenire:capture-now")!(trusted);
  ready(trusted, true, "switch-owner-b");
  settle({
    id: "capture",
    capturedAt: "now",
    deviceId: "test",
    platform: "linux",
    windows: [],
    tabs: [],
    media: [],
    collectorNotes: [],
    selectionText: "",
  });
  await running;
  expect(main.webContents.send.mock.calls.some(([channel]) => channel === "avenire:capture")).toBe(
    false,
  );
  const foreign = { ...trusted, senderFrame: { url: trusted.senderFrame.url } };
  await expect(
    mocks.ipc.get("avenire:reopen")!(foreign, { fileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  ).rejects.toThrow("Untrusted");
  expect(() => mocks.ipc.get("avenire:extension-connected")!(foreign)).toThrow("Untrusted");
});

it("keeps capture global, guards overlay actions and replays its state after a renderer reload", async () => {
  const main = mocks.windows[0]! as any;
  const overlay = mocks.windows.find((target) =>
    String(target.options.webPreferences?.preload).endsWith("overlay-preload.cjs"),
  )! as any;
  overlay.webContents.mainFrame.url = pathToFileURL(
    overlay.options.webPreferences.preload.replace("overlay-preload.cjs", "capture-overlay.html"),
  ).href;
  const trusted = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  const overlayEvent = { sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame };
  const ready = mocks.ipc.get("avenire:capture-ready")!;
  ready(trusted, true, "overlay-owner");
  main.showInactive.mockClear();
  main.show.mockClear();
  main.focus.mockClear();
  await mocks.ipc.get("avenire:capture-now")!(trusted);
  expect(main.showInactive).not.toHaveBeenCalled();
  expect(main.show).not.toHaveBeenCalled();
  expect(main.focus).not.toHaveBeenCalled();
  const state = () =>
    overlay.webContents.send.mock.calls
      .filter(([channel]: [string]) => channel === "avenire:overlay-state")
      .at(-1)![1];
  expect(state().phase).toBe("submitting");
  ready(trusted, false);
  ready(trusted, true, "overlay-owner");
  expect(state().phase).toBe("submitting");
  for (const channel of ["ready", "hovered", "resize", "dismissed", "undo", "open", "sources"]) {
    await expect(
      Promise.resolve().then(() =>
        mocks.ipc.get(`avenire:overlay-${channel}`)!({
          ...overlayEvent,
          senderFrame: { url: overlayEvent.senderFrame.url },
        }),
      ),
    ).rejects.toThrow("Untrusted");
  }
  const file = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Lecture",
    kind: "pdf",
    placement: "inbox",
    source: "capture",
    tags: [],
    folderIds: [],
    contentModifiedAt: null,
    archivedAt: null,
    sourceUrl: null,
    origin: null,
    access: "open",
    storageKey: null,
    mimeType: null,
    sizeBytes: null,
    captureId: null,
    mediaPositionSec: null,
    preview: null,
    purgeAt: null,
    createdAt: "now",
    updatedAt: "now",
  };
  const receipt = { files: [file], skipped: [], blocked: [] };
  mocks.ipc.get("avenire:capture-receipt")!(
    { ...trusted, senderFrame: { url: trusted.senderFrame.url } },
    "capture",
    receipt,
  );
  expect(state().phase).toBe("submitting");
  mocks.ipc.get("avenire:capture-failed")!(trusted, "capture", "Retry");
  expect(state().phase).toBe("failed");
  await mocks.ipc.get("avenire:capture-now")!(trusted);
  expect(state().phase).toBe("submitting");
  mocks.ipc.get("avenire:capture-receipt")!(trusted, "capture", receipt);
  expect(state().phase).toBe("done");
  main.webContents.send.mockClear();
  mocks.ipc.get("avenire:overlay-undo")!(overlayEvent, "wrong");
  expect(main.webContents.send).not.toHaveBeenCalled();
  mocks.ipc.get("avenire:overlay-undo")!(overlayEvent, "capture");
  expect(main.webContents.send).toHaveBeenLastCalledWith("avenire:capture-action", {
    type: "undo",
    captureId: "capture",
    fileIds: [file.id],
  });
  await mocks.ipc.get("avenire:overlay-open")!(overlayEvent, file.id);
  expect(main.loadURL).toHaveBeenLastCalledWith(`https://app.avenire.space/sources/${file.id}`);
  await mocks.ipc.get("avenire:overlay-sources")!(overlayEvent);
  expect(main.loadURL).toHaveBeenLastCalledWith("https://app.avenire.space/?tab=sources");
  ready(trusted, true, "different-owner");
  main.webContents.send.mockClear();
  mocks.ipc.get("avenire:overlay-undo")!(overlayEvent, "capture");
  expect(main.webContents.send).not.toHaveBeenCalled();
});

it("first launch stays in bundled setup and validates its exact frame before completing", async () => {
  mocks.completed = false;
  mocks.windows.length = 0;
  mocks.shortcuts.clear();
  vi.resetModules();
  await import("./main.ts");
  await vi.waitFor(() => expect(mocks.windows.length).toBe(2));
  const setup = mocks.windows[0] as any;
  expect(setup.options.webPreferences.preload).toContain("setup-preload.cjs");
  expect(setup.loadURL).not.toHaveBeenCalled();
  expect(mocks.collect).not.toHaveBeenCalled();
  expect(mocks.shortcuts.size).toBe(0);
  setup.webContents.mainFrame.url = pathToFileURL(setup.loadFile.mock.calls[0][0]).href;
  const trusted = { sender: setup.webContents, senderFrame: setup.webContents.mainFrame };
  const status = mocks.ipc.get("avenire:setup-status")!;
  expect(status(trusted)).toMatchObject({ completed: false });
  expect(() =>
    status({ ...trusted, senderFrame: { url: setup.webContents.mainFrame.url } }),
  ).toThrow("Untrusted");
  const complete = mocks.ipc.get("avenire:setup-complete")!;
  await expect(complete(trusted, { foregroundCapture: "yes" })).rejects.toThrow();
  expect(mocks.windows).toHaveLength(2);
  expect(mocks.ipc.get("avenire:setup-hotkeys")!(trusted, true)).toMatchObject({
    hotkeysEnabled: true,
  });
  expect(mocks.shortcuts.has("Ctrl+Shift+Space")).toBe(true);
  mocks.ipc.get("avenire:setup-try")!(trusted, true, false);
  expect(() => mocks.ipc.get("avenire:capture-now")!(trusted)).toThrow("Untrusted");
  // The setup bridge never receives hosted-app IPC privileges.
  expect(mocks.collect).not.toHaveBeenCalled();
  mocks.shortcuts.get("Ctrl+Shift+Space")!();
  await vi.waitFor(() =>
    expect(setup.webContents.send).toHaveBeenCalledWith("avenire:setup-capture", {
      id: "capture",
      sources: [],
    }),
  );
  expect(mocks.collect).toHaveBeenCalledWith(expect.any(String), { foreground: false });
  mocks.collect.mockClear();
  await complete(trusted, { foregroundCapture: false });
  expect(mocks.windows.at(-1)!.loadURL).toHaveBeenCalledWith("https://app.avenire.space");
  expect(setup.close).toHaveBeenCalledOnce();
  const main = mocks.windows.at(-1)!;
  const appSender = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  mocks.ipc.get("avenire:capture-ready")!(appSender, true, "onboarding-owner");
  await vi.waitFor(() =>
    expect(main.webContents.send).toHaveBeenCalledWith(
      "avenire:capture",
      expect.objectContaining({ uploads: { files: [], skipped: [] } }),
    ),
  );
  // Finishing setup drains its staged snapshot after authentication, without collecting again.
  expect(mocks.collect).not.toHaveBeenCalled();
});
