import { expect, it, vi } from "vite-plus/test";
import { collectSnapshot } from "./collect.ts";
const mocks = vi.hoisted(() => ({
  foreground: vi.fn(async () => ({
    windows: [{ appName: "Preview", title: "Study", filePath: "/tmp/Study.pdf", foreground: true }],
    notes: [],
  })),
}));
vi.mock("../config.ts", () => ({
  captureAppData: "",
  captureConfigHome: "",
  powerShellOneShot: false,
}));
vi.mock("./native.ts", async (original) => ({
  ...(await original<typeof import("./native.ts")>()),
  collectNative: async () => ({ windows: [], media: [], notes: [] }),
}));
vi.mock("./foreground.ts", () => ({ collectForeground: mocks.foreground }));
vi.mock("./tabs.ts", () => ({
  latestTabs: () => [
    {
      url:
        process.platform === "win32"
          ? "file:///C:/tmp/Browser%20Study.pdf"
          : "file:///tmp/Browser%20Study.pdf",
      title: "Browser Study",
      tabId: 1,
      windowId: 1,
      browser: "chrome",
      activeInWindow: true,
      engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
    },
    {
      url: "file:///tmp/Private.pdf",
      title: "Private",
      tabId: 1,
      windowId: 1,
      browser: "chrome",
      activeInWindow: true,
      incognito: true,
      engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
    },
  ],
}));

it("keeps foreground collectors off until opted in and resolves browser file URLs for native upload", async () => {
  const snapshot = await collectSnapshot("2026-10-21T00:00:00Z");
  expect(mocks.foreground).not.toHaveBeenCalled();
  expect(snapshot.windows).toEqual([
    {
      appName: "Browser",
      title: "Browser Study",
      filePath:
        process.platform === "win32"
          ? String.raw`C:\tmp\Browser Study.pdf`
          : "/tmp/Browser Study.pdf",
      foreground: true,
    },
  ]);
  expect(snapshot.capturedAt).toBe("2026-10-21T00:00:00Z");
  expect(snapshot.deviceId).toMatch(/^[0-9a-f]{32}$/);
});

it("includes a foreground path when desktop setup explicitly enables capture", async () => {
  const snapshot = await collectSnapshot("now", { foreground: true });
  expect(mocks.foreground).toHaveBeenCalledOnce();
  expect(snapshot.windows).toContainEqual({
    appName: "Preview",
    title: "Study",
    filePath: "/tmp/Study.pdf",
    foreground: true,
  });
});
