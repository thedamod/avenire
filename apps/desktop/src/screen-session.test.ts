import { afterEach, expect, it, vi } from "vite-plus/test";

// Exercise the real IPC handlers; replace only the desktop, transport and native boundaries.
const mocks = vi.hoisted(() => {
  const displays = [
    {
      id: 1,
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: -1920, y: 0, width: 1920, height: 1040 },
    },
    {
      id: 2,
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      workArea: { x: 0, y: 0, width: 2560, height: 1400 },
    },
  ];
  const monitors = displays.map((display, index) => ({
    name: `DP-${index + 1}`,
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width * (index === 0 ? 1 : 1.5),
    height: display.bounds.height * (index === 0 ? 1 : 1.5),
    scale: index === 0 ? 1 : 1.5,
    transform: 0,
    disabled: false,
    dpmsStatus: true,
    mirrorOf: "none",
  }));
  return {
    monitors,
    startupErrors: [] as string[],
    wayland: false,
    command: vi.fn(async (command: string, _args?: unknown, _options?: unknown) => ({
      stdout: command === "hyprctl" ? JSON.stringify(monitors) : Buffer.from("screen-png"),
      stderr: "",
    })),
    nativeEnabled: false,
    nativeRequest: vi.fn(async (_method: string, _params?: unknown): Promise<any> => ({})),
    nativeCapture: vi.fn(async (): Promise<any> => ({})),
    nativeCreated: vi.fn(),
    activeScreen: "left",
    pointer: { x: -100, y: 100 },
    displays,
    windows: [] as any[],
    ipc: new Map<string, (...args: any[]) => any>(),
    appEvents: new Map<string, (...args: any[]) => unknown>(),
    shortcuts: new Map<string, () => void>(),
    session: {
      fetch: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
    },
  };
});
vi.mock("./config.ts", () => ({
  appUrl: "https://app.avenire.space",
  defaultCaptureShortcut: "Ctrl+Shift+Space",
  defaultPromptShortcut: "Alt+Space",
  fallbackPromptShortcut: "Alt+Shift+Space",
  get isWayland() {
    return mocks.wayland;
  },
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: mocks.command }),
}));
vi.mock("./capture/diagnostics.ts", () => ({
  initializeCaptureLog: vi.fn(),
  captureLog: vi.fn(),
  captureError: () => ({}),
  captureLogPath: () => undefined,
}));
vi.mock("./capture/identity.ts", () => ({
  loadInstallIdentity: () => ({ deviceId: "test-device" }),
}));
vi.mock("./capture/registry.ts", () => ({
  LocalOriginRegistry: class {
    load = async () => {};
    downloads = () => [];
  },
}));
vi.mock("./capture/pairing.ts", () => ({
  PairingAuthority: class {
    load = async () => {};
    setOwner = vi.fn();
    refreshToken = async () => {};
  },
}));
vi.mock("./capture-overlay.ts", () => ({
  captureOverlayAssetsAvailable: () => false,
  CaptureOverlay: class {
    clear = vi.fn();
  },
}));
vi.mock("./capture/collect.ts", () => ({
  setCaptureDeviceId: vi.fn(),
  collectSnapshot: vi.fn(),
  instantCapture: vi.fn(),
}));
vi.mock("./capture/native.ts", () => ({
  startNativePoll: () => () => {},
  clearNativeCache: vi.fn(),
}));
vi.mock("./capture/foreground.ts", () => ({ startForegroundPoll: () => () => {} }));
vi.mock("./capture/collectors/ps-queue.ts", () => ({ prewarmPowerShell: async () => {} }));
vi.mock("./capture/tabs.ts", () => ({
  extensionChannel: undefined,
  resetTabsOwner: vi.fn(),
  startTabsReceiver: vi.fn(),
  stopTabsReceiver: vi.fn(),
  latestTabs: () => [],
  tabsReceiverAvailable: () => true,
}));
vi.mock("./capture/session.ts", () => ({ captureUploadSession: () => vi.fn() }));
vi.mock("./auth.ts", () => ({
  DesktopAuth: class {
    start = async () => {};
    close = vi.fn();
  },
  isProviderAuthUrl: () => false,
}));
vi.mock("./setup.ts", () => ({
  DesktopSetup: class {
    completed = true;
    foregroundCapture = false;
    load = async () => {};
  },
}));
vi.mock("./native-overlay.ts", () => ({
  loadNativeOverlayConfig: () => ({
    get enabled() {
      return mocks.nativeEnabled;
    },
    executable: "/fake",
  }),
  NativeOverlay: class {
    constructor() {
      mocks.nativeCreated();
    }
    available = true;
    request = mocks.nativeRequest;
    capture = mocks.nativeCapture;
    dispose = vi.fn();
  },
}));
vi.mock("electron", () => ({
  app: {
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    on: (event: string, callback: (...args: any[]) => unknown) =>
      mocks.appEvents.set(event, callback),
    getAppPath: () => "/test",
    getPath: () => "/test",
    quit: vi.fn(),
  },
  BrowserWindow: class {
    options;
    events = new Map<string, (...args: any[]) => unknown>();
    webContents = {
      session: mocks.session,
      mainFrame: { url: "https://app.avenire.space/" },
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      setBackgroundThrottling: vi.fn(),
    };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      mocks.windows.push(this);
    }
    isDestroyed = () => false;
    isFocused = () => false;
    isVisible = () => true;
    loadURL = async () => {};
    once = (event: string, callback: (...args: any[]) => unknown) =>
      this.events.set(event, callback);
    on = (event: string, callback: (...args: any[]) => unknown) => this.events.set(event, callback);
    show = vi.fn();
    focus = vi.fn();
    setBounds = vi.fn();
    setAlwaysOnTop = vi.fn();
    setVisibleOnAllWorkspaces = vi.fn();
    destroy = vi.fn();
  },
  screen: {
    getCursorScreenPoint: () => ({ ...mocks.pointer }),
    getDisplayNearestPoint: (point: { x: number }) => mocks.displays[point.x < 0 ? 0 : 1],
    getAllDisplays: () => mocks.displays,
  },
  globalShortcut: {
    register: (accelerator: string, callback: () => void) => {
      mocks.shortcuts.set(accelerator, callback);
      return true;
    },
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) =>
      mocks.ipc.set(channel, handler),
  },
  Menu: { buildFromTemplate: (template: unknown) => template, setApplicationMenu: vi.fn() },
  nativeImage: {
    createFromBuffer: () => ({
      isEmpty: () => false,
      getSize: () => ({ width: 100, height: 100 }),
      toPNG: () => Buffer.from("screen-png"),
    }),
    createFromPath: () => ({ resize: () => ({ setTemplateImage: vi.fn() }) }),
  },
  dialog: {
    showErrorBox: (_title: string, message: string) => mocks.startupErrors.push(message),
    showMessageBox: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
  Tray: class {
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    on = vi.fn();
    destroy = vi.fn();
  },
}));
afterEach(() => {
  mocks.appEvents.get("before-quit")?.();
});

it("keeps disabled screen reads discoverable without native startup; checks owner, operator and revocation", async () => {
  await import("./main.ts");
  await vi.waitFor(() => {
    expect(mocks.startupErrors).toEqual([]);
    expect(mocks.shortcuts.has("Alt+Space")).toBe(true);
  });
  const main = mocks.windows[0]!;
  const appSender = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  mocks.ipc.get("avenire:capture-ready")!(appSender, true, "screen-owner");
  mocks.nativeEnabled = true;
  mocks.shortcuts.get("Alt+Space")!();
  const prompt = mocks.windows.at(-1)! as any;
  prompt.webContents.mainFrame.url = "https://app.avenire.space/prompt";
  prompt.isVisible = () => true;
  prompt.getOpacity = () => 1;
  prompt.setOpacity = vi.fn();
  const event = { sender: prompt.webContents, senderFrame: prompt.webContents.mainFrame };
  const context = async () =>
    (await mocks.ipc.get("avenire:prompt-capture-context")!(event)) as any;
  const read = async () =>
    mocks.ipc.get("avenire:read-screen")!(event, (await context()).sessionId) as Promise<any>;
  expect(mocks.ipc.get("avenire:native-overlay-available")!(event)).toBe(true);
  expect(mocks.nativeCreated).not.toHaveBeenCalled();
  expect(mocks.session.fetch).not.toHaveBeenCalled();
  const grant = { userId: "screen-owner", sessionId: "screen-session", enabled: false };
  mocks.session.fetch.mockImplementation(async () => Response.json(grant));
  expect(await read()).toMatchObject({
    status: "disabled",
    message: expect.stringContaining("Settings → Capture"),
  });
  expect(mocks.nativeCreated).not.toHaveBeenCalled();
  expect(mocks.nativeCapture).not.toHaveBeenCalled();
  mocks.nativeEnabled = false;
  await expect(read()).rejects.toThrow("operator");
  expect(mocks.nativeCreated).not.toHaveBeenCalled();
  mocks.nativeEnabled = true;
  grant.enabled = true;
  prompt.getBounds = () => ({ x: 0, y: 0, width: 400, height: 420 });
  mocks.nativeRequest.mockImplementation(async (method, params: any) => {
    if (method === "select_screen") mocks.activeScreen = params.screenId;
    return method === "get_cursor"
      ? {
          globalX: mocks.pointer.x,
          globalY: mocks.pointer.y,
          screenId: mocks.activeScreen,
          inBounds: false,
          observedAt: "now",
        }
      : {
          screens: mocks.displays.map((display, index) => ({
            id: index === 0 ? "left" : "right",
            ...display.bounds,
          })),
          rotation: { x: 0, y: 0 },
          visualizationMode: "3d",
          visualizationVisible: false,
          visualizationInteractive: false,
          sceneTitle: "",
        };
  });
  mocks.nativeCapture.mockImplementation(async () => ({
    screenId: mocks.activeScreen,
    data: "png",
    mimeType: "image/png",
    capturedAt: "now",
    width: 100,
    height: 100,
  }));
  expect((await read()).capture).toMatchObject({ data: "png", screenId: "left" });
  mocks.pointer = { x: 100, y: 100 };
  expect((await read()).capture).toMatchObject({ data: "png", screenId: "right" });
  expect(mocks.nativeRequest).toHaveBeenCalledWith("select_screen", { screenId: "right" });
  expect(mocks.nativeCreated).toHaveBeenCalledOnce();
  mocks.nativeCapture.mockImplementationOnce(async () => {
    const screenId = mocks.activeScreen;
    mocks.pointer = { x: -100, y: 100 };
    return {
      screenId,
      data: "png",
      mimeType: "image/png",
      capturedAt: "now",
      width: 100,
      height: 100,
    };
  });
  // Pointer movement during acquisition cannot relabel a frame from another monitor.
  expect((await read()).capture.screenId).toBe("right");
  const disconnected = mocks.displays[0]!;
  mocks.nativeCapture.mockImplementationOnce(async () => {
    mocks.displays.shift();
    return {
      screenId: mocks.activeScreen,
      data: "png",
      mimeType: "image/png",
      capturedAt: "now",
      width: 100,
      height: 100,
    };
  });
  await expect(read()).rejects.toThrow("selected display changed");
  mocks.displays.unshift(disconnected);
  mocks.nativeCapture.mockImplementationOnce(async () => {
    grant.enabled = false;
    return {
      screenId: mocks.activeScreen,
      data: "secret",
      mimeType: "image/png",
      capturedAt: "now",
      width: 100,
      height: 100,
    };
  });
  await expect(read()).rejects.toThrow("revoked");
  expect((await context()).capture).toBeNull();
  grant.enabled = true;
  mocks.session.fetch.mockRejectedValueOnce(new Error("offline"));
  await expect(read()).rejects.toThrow("offline");
  const created = mocks.nativeCreated.mock.calls.length;
  mocks.session.fetch.mockResolvedValueOnce(Response.json({ ...grant, userId: "another-owner" }));
  await expect(read()).rejects.toThrow("account changed");
  expect(mocks.nativeCreated).toHaveBeenCalledTimes(created);
  const stale = (await context()).sessionId;
  mocks.ipc.get("avenire:capture-ready")!(appSender, false);
  await expect(mocks.ipc.get("avenire:read-screen")!(event, stale)).rejects.toThrow("Stale");
});

it.runIf(process.platform === "linux")(
  "captures each cursor-selected Wayland output at compositor scale and rejects unmappable outputs",
  async () => {
    vi.resetModules();
    mocks.windows.length = 0;
    mocks.shortcuts.clear();
    mocks.ipc.clear();
    mocks.wayland = true;
    mocks.nativeEnabled = true;
    mocks.pointer = { x: -100, y: 100 };
    mocks.nativeCapture.mockClear();
    mocks.command.mockClear();
    mocks.session.fetch
      .mockReset()
      .mockImplementation(async () =>
        Response.json({ userId: "wayland-owner", sessionId: "wayland-session", enabled: true }),
      );
    await import("./main.ts");
    await vi.waitFor(() => expect(mocks.shortcuts.has("Alt+Space")).toBe(true));
    const main = mocks.windows[0]!;
    mocks.ipc.get("avenire:capture-ready")!(
      { sender: main.webContents, senderFrame: main.webContents.mainFrame },
      true,
      "wayland-owner",
    );
    mocks.shortcuts.get("Alt+Space")!();
    const prompt = mocks.windows.at(-1)!;
    prompt.webContents.mainFrame.url = "https://app.avenire.space/prompt";
    prompt.getOpacity = () => 1;
    prompt.setOpacity = vi.fn();
    prompt.getBounds = () => ({ x: 0, y: 0, width: 400, height: 420 });
    const event = { sender: prompt.webContents, senderFrame: prompt.webContents.mainFrame };
    const read = async () => {
      const context = await mocks.ipc.get("avenire:prompt-capture-context")!(event);
      return mocks.ipc.get("avenire:read-screen")!(event, context.sessionId);
    };
    const first = await read();
    expect(first.capture.screenId).toBe("left");
    expect(mocks.command).toHaveBeenCalledWith(
      "grim",
      ["-c", "-o", "DP-1", "-"],
      expect.any(Object),
    );
    mocks.pointer = { x: 100, y: 100 };
    mocks.command.mockImplementation(async (command) => {
      if (command === "hyprctl") return { stdout: JSON.stringify(mocks.monitors), stderr: "" };
      mocks.pointer = { x: -100, y: 100 };
      return { stdout: Buffer.from("screen-png"), stderr: "" };
    });
    const second = await read();
    expect(second.capture.screenId).toBe("right");
    expect(second.capture.cursor.globalX).toBe(100);
    expect(
      mocks.command.mock.calls.filter(([command]) => command === "grim").map((call) => call[1]),
    ).toEqual([
      ["-c", "-o", "DP-1", "-"],
      ["-c", "-o", "DP-2", "-"],
    ]);
    mocks.monitors[0]!.transform = 1;
    const screenshots = mocks.command.mock.calls.filter(([command]) => command === "grim").length;
    await expect(read()).rejects.toThrow("rotated or mirrored");
    expect(mocks.command.mock.calls.filter(([command]) => command === "grim")).toHaveLength(
      screenshots,
    );
    mocks.monitors[0]!.transform = 0;
    expect(mocks.nativeCapture).not.toHaveBeenCalled();

    // Account teardown while the compositor is answering must stop acquisition.
    let lookups = 0;
    mocks.command.mockImplementation(async (command) => {
      if (command === "hyprctl") {
        if (++lookups === 2)
          mocks.ipc.get("avenire:capture-ready")!(
            { sender: main.webContents, senderFrame: main.webContents.mainFrame },
            false,
          );
        return { stdout: JSON.stringify(mocks.monitors), stderr: "" };
      }
      return { stdout: Buffer.from("screen-png"), stderr: "" };
    });
    await expect(read()).rejects.toThrow("Stale");
    expect(mocks.command.mock.calls.filter(([command]) => command === "grim")).toHaveLength(
      screenshots,
    );
  },
);
