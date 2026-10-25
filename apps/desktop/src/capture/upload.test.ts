import { expect, it, vi } from "vite-plus/test";
import { describeCapturedSources, uploadCapturedFiles } from "./upload.ts";
import type { CaptureSnapshot } from "@avenire/contracts";
const mocks = vi.hoisted(() => ({ acquire: vi.fn(async () => ({ id: "uploaded" })) }));
vi.mock("./source-acquisition.ts", () => ({ acquireAndUploadSource: mocks.acquire }));
const snapshot = {
  id: "capture-a",
  capturedAt: "now",
  deviceId: "device",
  platform: "linux",
  tabs: [],
  media: [],
  collectorNotes: [],
  windows: [
    { appName: "Preview", title: "Study", foreground: true, filePath: "/home/student/Study.pdf" },
  ],
} as unknown as CaptureSnapshot;

it("uploads native paths through the existing ingestion API once, with deterministic retry keys", async () => {
  const duplicated = { ...snapshot, windows: [...snapshot.windows, ...snapshot.windows] };
  const fetch = vi.fn();
  expect(await uploadCapturedFiles(duplicated, "https://app.test", fetch)).toMatchObject({
    files: [{ id: "uploaded" }],
    skipped: [],
  });
  expect(mocks.acquire).toHaveBeenCalledOnce();
  const [source, metadata, options] = mocks.acquire.mock.calls[0] as unknown as [unknown, any, any];
  expect(source).toEqual({ type: "local-file", path: "/home/student/Study.pdf" });
  expect(metadata).toMatchObject({ title: "Study.pdf", kind: "pdf", mimeType: "application/pdf" });
  expect(metadata.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(metadata)).not.toContain("/home/student");
  expect(options.avenireFetch).toBe(fetch);
  await uploadCapturedFiles(snapshot, "https://app.test", fetch);
  expect((mocks.acquire.mock.calls[1] as unknown as [unknown, any])[1].idempotencyKey).toBe(
    metadata.idempotencyKey,
  );
});

it("reports unsupported files and upload failures without sending a path to the renderer", async () => {
  mocks.acquire.mockRejectedValue(new Error("private path /home/student/Study.pdf"));
  const result = await uploadCapturedFiles(
    {
      ...snapshot,
      windows: [
        ...snapshot.windows,
        {
          appName: "Reader",
          title: "Book",
          foreground: false,
          filePath: "/home/student/Book.epub",
        },
      ],
    },
    "https://app.test",
    vi.fn(),
  );
  expect(result.files).toEqual([]);
  expect(result.skipped).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("/home/student");
});

it("previews only unique sources supported by ingestion, without exposing device paths", () => {
  const source = { ...snapshot.windows[0]!, filePath: "/home/student/Book.epub" };
  const tab = {
    url: "https://example.org/study",
    title: "Study page",
    activeInWindow: true,
    engagement: { dwellMs: 0, scrollDepthPct: 0, mediaPlaying: false },
  };
  const sources = describeCapturedSources({
    ...snapshot,
    windows: [...snapshot.windows, ...snapshot.windows, source],
    tabs: [tab, tab],
  });
  expect(sources).toEqual([
    { title: "Study.pdf", kind: "pdf" },
    { title: "Study page", kind: "web-page" },
  ]);
  expect(JSON.stringify(sources)).not.toContain("/home/student");
});
