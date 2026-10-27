import { afterEach, expect, it, vi } from "vite-plus/test";
import { applyPolicy } from "@avenire/capture/policy";
const mocks = vi.hoisted(() => ({
  windows: vi.fn(async () => [
    { appName: "Preview", windowTitle: "Cached PDF", filePath: "/private/Cached.pdf" },
  ]),
  media: vi.fn(async () => []),
  obsidian: vi.fn(async () => []),
  acquire: vi.fn(async () => ({ id: "uploaded", title: "Cached.pdf" })),
}));
vi.mock("./research/electron/collectors/background-windows.ts", () => ({
  getBackgroundWindows: mocks.windows,
}));
vi.mock("./research/electron/collectors/background-media.ts", () => ({
  getBackgroundMedia: mocks.media,
}));
vi.mock("./research/electron/collectors/obsidian-note.ts", () => ({
  resolveObsidianOpenNotes: mocks.obsidian,
}));
vi.mock("./source-acquisition.ts", () => ({ acquireAndUploadSource: mocks.acquire }));
vi.mock("./foreground.ts", () => ({
  cachedForeground: () => ({ windows: [], notes: ["Foreground unavailable on Wayland"] }),
  resolveForeground: async (observation: unknown) => observation,
}));
vi.mock("./tabs.ts", () => ({ latestTabs: () => [] }));
import { instantCapture } from "./collect.ts";
import { cachedNative, clearNativeCache, refreshNative } from "./native.ts";
import { captureItems, runCapturePipeline } from "./pipeline.ts";
import { CaptureProgressStream } from "./progress.ts";
import { LocalOriginRegistry } from "./registry.ts";
afterEach(() => {
  clearNativeCache();
  vi.useRealTimers();
});
it("uploads an instantly shown cached PDF when native fill-in times out", async () => {
  vi.useFakeTimers();
  await refreshNative();
  const instant = instantCapture(new Date().toISOString(), true);
  expect(captureItems(applyPolicy(instant.snapshot).snapshot)[0]?.title).toBe("Cached.pdf");
  mocks.windows.mockImplementationOnce(() => new Promise(() => {}));
  const initial = applyPolicy(instant.snapshot);
  const stream = new CaptureProgressStream(
    { id: instant.snapshot.id, items: captureItems(initial.snapshot) },
    vi.fn(),
  );
  const work = runCapturePipeline({
    initial,
    resolve: instant.resolve,
    session: Promise.resolve(vi.fn()),
    owner: "alice",
    appUrl: "https://app.test",
    registry: new LocalOriginRegistry("/unused"),
    stream,
    readInBrowser: false,
    signal: new AbortController().signal,
  });
  await vi.advanceTimersByTimeAsync(9001);
  const result = await work;
  expect(result.uploads?.files).toHaveLength(1);
  expect(mocks.acquire).toHaveBeenCalledWith(
    { type: "local-file", path: "/private/Cached.pdf" },
    expect.anything(),
    expect.anything(),
  );
  expect(stream.events.at(-1)?.status).toBe("saved");
  clearNativeCache();
  expect(cachedNative().windows).toEqual([]);
});
it("runs media, proc/window and Obsidian fill-in with consent despite an unavailable foreground API", async () => {
  const enabled = instantCapture(new Date().toISOString(), true);
  const result = await enabled.resolve();
  expect(mocks.windows).toHaveBeenCalledOnce();
  expect(mocks.media).toHaveBeenCalledOnce();
  expect(mocks.obsidian).toHaveBeenCalledOnce();
  expect(result.collectorNotes).toContain("Foreground unavailable on Wayland");
  expect(result.windows[0]?.filePath).toBe("/private/Cached.pdf");
});
