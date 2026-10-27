import { expect, it, vi } from "vite-plus/test";
import type { CapturedTab } from "@avenire/contracts";
const mocks = vi.hoisted(() => ({
  windows: vi.fn(async () => [
    { appName: "WINWORD", windowTitle: "essay.docx", filePath: "C:\\Users\\u\\essay.docx" },
  ]),
  media: vi.fn(async () => [
    { appName: "vlc", title: "Lecture", filePath: "/home/u/lecture.mp4", positionSec: 12 },
  ]),
  notes: vi.fn(async () => ["/home/u/notes.md"]),
}));
vi.mock("./research/electron/collectors/background-windows.ts", () => ({
  getBackgroundWindows: mocks.windows,
}));
vi.mock("./research/electron/collectors/background-media.ts", () => ({
  getBackgroundMedia: mocks.media,
}));
vi.mock("./research/electron/collectors/obsidian-note.ts", () => ({
  resolveObsidianOpenNotes: mocks.notes,
}));
import {
  collectNative,
  correlateBrowserMedia,
  refreshNative,
  cachedNative,
  clearNativeCache,
} from "./native.ts";
import { applyPolicy } from "@avenire/capture/policy";
import { mergeSessionsAndFiles } from "./research/src/capture/background-merge.ts";
const tab: CapturedTab = {
  tabId: 1,
  windowId: 2,
  browser: "chrome",
  title: "Lecture",
  url: "https://school.test/lecture",
  activeInWindow: false,
  engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
};
it("collects background documents, Obsidian leaves and media paths with policy provenance", async () => {
  const result = await collectNative();
  expect(result.windows).toEqual(
    expect.arrayContaining([
      {
        appName: "WINWORD",
        title: "essay.docx",
        filePath: "C:\\Users\\u\\essay.docx",
        foreground: false,
      },
      { appName: "Obsidian", title: "notes.md", filePath: "/home/u/notes.md", foreground: false },
      { appName: "vlc", title: "Lecture", filePath: "/home/u/lecture.mp4", foreground: false },
    ]),
  );
  expect(result.media[0]?.positionSec).toBe(12);
});
it("correlates a browser timeline to a unique permitted tab, without creating a standalone browser source", () => {
  const native = {
    windows: [],
    media: [{ appName: "Chrome", title: "Lecture", positionSec: 42 }],
    notes: [],
  };
  const result = correlateBrowserMedia(native, [tab]);
  expect(result.tabs[0]?.position?.mediaSec).toBe(42);
  expect(result.media).toEqual([{ ...native.media[0], url: tab.url }]);
  expect(correlateBrowserMedia(native, [tab, { ...tab, tabId: 2 }]).media).toEqual([]);
  expect(correlateBrowserMedia(native, [{ ...tab, incognito: true }]).media).toEqual([]);
  const blocked = correlateBrowserMedia(native, [{ ...tab, url: "https://mail.google.com/inbox" }]);
  const policy = applyPolicy({
    id: "capture" as never,
    capturedAt: "now",
    deviceId: "device",
    platform: "linux",
    ...blocked,
    collectorNotes: [],
  });
  expect(policy.snapshot.tabs).toEqual([]);
  expect(policy.snapshot.media).toEqual([]);
});
it("does not attach an unrelated player's file or a browser session to local media", () => {
  expect(
    mergeSessionsAndFiles(
      [{ appName: "Spotify", title: "Private listening", status: "Playing" }],
      [{ appName: "vlc", path: "/home/u/lecture.mp4" }],
    ),
  ).toHaveLength(2);
});
it("shares cache refreshes and discards cache writes after owner changes", async () => {
  clearNativeCache();
  const pending = refreshNative();
  expect(refreshNative()).toBe(pending);
  clearNativeCache();
  await pending;
  expect(cachedNative().windows).toEqual([]);
  await refreshNative();
  expect(cachedNative().media).toHaveLength(1);
  clearNativeCache();
});
it("returns after each native collector's fixed budget", async () => {
  vi.useFakeTimers();
  mocks.windows.mockImplementationOnce(() => new Promise(() => {}));
  const pending = collectNative();
  await vi.advanceTimersByTimeAsync(9001);
  expect((await pending).notes).toContain("background-windows:budget-exhausted");
  vi.useRealTimers();
});
it("keeps local media positions when other players also expose sessions", () => {
  const items = mergeSessionsAndFiles(
    [
      { appName: "Media Player", title: "Lecture", status: "Paused", positionSec: 42 },
      { appName: "Spotify", title: "Unrelated", status: "Playing" },
    ],
    [{ appName: "Microsoft.Media.Player", path: "/home/u/lecture.mp4" }],
  );
  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({ filePath: "/home/u/lecture.mp4", positionSec: 42 });
  expect(items[1]?.filePath).toBeUndefined();
});
