import { mkdtemp, writeFile, rm, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { MAX_SOURCE_UPLOAD_BYTES } from "@avenire/contracts";
import { acquireAndUploadSource } from "./source-acquisition.ts";
import { uploadCapturedFiles } from "./upload.ts";
import { LocalOriginRegistry } from "./registry.ts";
import { UploadGate } from "./hash-cache.ts";
import type { CaptureSnapshot } from "@avenire/contracts";

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  mocks.open.mockImplementation(actual.open);
  return { ...actual, open: mocks.open };
});
const directories: string[] = [];
afterEach(async () => {
  const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  mocks.open.mockReset().mockImplementation(fs.open);
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "capture-windows-"));
  directories.push(directory);
  const path = join(directory, "Essay.docx");
  await writeFile(path, "open document original bytes");
  const file = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    kind: "document",
    title: "Essay",
    placement: "inbox",
    source: "upload",
    tags: [],
    contentModifiedAt: null,
    archivedAt: null,
    sourceUrl: null,
    storageKey: null,
    mimeType: "application/msword",
    sizeBytes: 28,
    captureId: null,
    folderIds: [],
    origin: null,
    access: "open",
    mediaPositionSec: null,
    preview: null,
    purgeAt: null,
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
  };
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          uploadId: file.id,
          uploadUrl: `/api/library/uploads/${file.id}`,
          status: "completed",
          expiresAt: "2099-01-01T00:00:00Z",
          file,
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  const metadata = {
    idempotencyKey: file.id,
    title: "Essay",
    kind: "document" as const,
    mimeType: "application/msword",
  };
  return { path, fetch, metadata, file };
}

it("accepts changing Windows ctime while checking both mtime and size for real content changes", async () => {
  const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  for (const change of ["ctimeMs", "mtimeMs", "size"] as const) {
    const h = await setup();
    mocks.open.mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args);
      if (args[0] === h.path) {
        const stat = handle.stat.bind(handle);
        let count = 0;
        vi.spyOn(handle, "stat").mockImplementation(async () => {
          const info = await stat();
          if (count++) info[change] += 100;
          return info;
        });
      }
      return handle;
    });
    const result = acquireAndUploadSource({ type: "local-file", path: h.path }, h.metadata, {
      appUrl: "https://app.test",
      avenireFetch: h.fetch,
    });
    if (change === "ctimeMs") expect(await result).toMatchObject({ id: h.file.id });
    else {
      await expect(result).rejects.toMatchObject({
        cause: { message: "Source changed during capture; capture again." },
      });
      expect(h.fetch).not.toHaveBeenCalled();
    }
  }
});

it.each(["EBUSY", "EPERM"])(
  "retries %s once after 300ms and succeeds for a Word-held file",
  async (code) => {
    const h = await setup();
    const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const start = Date.now();
    let attempts = 0;
    const times: number[] = [];
    mocks.open.mockImplementation(async (...args: Parameters<typeof fs.open>) => {
      if (args[0] === h.path) {
        times.push(Date.now() - start);
        if (!attempts++) throw Object.assign(new Error("locked"), { code });
      }
      return fs.open(...args);
    });
    expect(
      await acquireAndUploadSource({ type: "local-file", path: h.path }, h.metadata, {
        appUrl: "https://app.test",
        avenireFetch: h.fetch,
      }),
    ).toMatchObject({ id: h.file.id });
    expect(attempts).toBe(2);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(290);
  },
);

it("makes at most two open attempts and never opens Office owner files or device paths", async () => {
  const h = await setup();
  mocks.open.mockRejectedValue(Object.assign(new Error("locked"), { code: "EBUSY" }));
  await expect(
    acquireAndUploadSource({ type: "local-file", path: h.path }, h.metadata, {
      appUrl: "https://app.test",
      avenireFetch: h.fetch,
    }),
  ).rejects.toMatchObject({ cause: { code: "EBUSY" } });
  expect(mocks.open).toHaveBeenCalledTimes(2);
  mocks.open.mockClear();
  for (const path of [
    join(h.path, "../~$Essay.docx"),
    String.raw`\Device\HarddiskVolume3\Essay.docx`,
  ])
    await expect(
      acquireAndUploadSource({ type: "local-file", path }, h.metadata, {
        appUrl: "https://app.test",
        avenireFetch: h.fetch,
      }),
    ).rejects.toMatchObject({ operation: "acquire" });
  expect(mocks.open).not.toHaveBeenCalled();
});

it("normalizes overlong and empty upload titles before the strict decoder", async () => {
  const h = await setup();
  for (const title of [" ".repeat(5), "Title".repeat(100)]) {
    await acquireAndUploadSource(
      { type: "local-file", path: h.path },
      { ...h.metadata, title },
      { appUrl: "https://app.test", avenireFetch: h.fetch },
    );
    const call = h.fetch.mock.calls.at(-1) as unknown as [string, RequestInit];
    const payload = JSON.parse(String(call[1].body));
    expect(payload.title.length).toBeGreaterThan(0);
    expect(payload.title.length).toBeLessThanOrEqual(200);
  }
});

it("skips media over 256 MiB before reading/uploading and skips owner lock files", async () => {
  const h = await setup();
  const path = h.path.replace(".docx", ".mp4");
  await writeFile(path, "");
  await truncate(path, MAX_SOURCE_UPLOAD_BYTES + 1);
  const progress = vi.fn();
  const snapshot = {
    id: h.file.id,
    capturedAt: new Date().toISOString(),
    deviceId: "device",
    platform: "linux",
    tabs: [],
    media: [],
    collectorNotes: [],
    windows: [
      { appName: "VLC", title: "Lecture", filePath: path, foreground: true },
      {
        appName: "WINWORD",
        title: "Lock",
        filePath: join(path, "../~$Essay.docx"),
        foreground: false,
      },
    ],
  } as unknown as CaptureSnapshot;
  const result = await uploadCapturedFiles(snapshot, "https://app.test", h.fetch, undefined, {
    owner: "alice",
    registry: new LocalOriginRegistry(join(directories[0]!, "origins.json")),
    gate: new UploadGate(),
    keyForPath: (path) => path,
    progress,
  });
  expect(result.files).toEqual([]);
  expect(result.skipped.map((entry) => entry.reason)).toEqual(
    expect.arrayContaining([expect.stringContaining("256 MB"), "Office owner lock file skipped"]),
  );
  expect(progress.mock.calls.every((call) => call[1] !== "failed")).toBe(true);
  expect(h.fetch).not.toHaveBeenCalled();
});

it("logs create and put rejection status and scrubbed server messages without source contents", async () => {
  const { initializeCaptureLog } = await import("./diagnostics.ts");
  const { readFile } = await import("node:fs/promises");
  const h = await setup();
  const path = initializeCaptureLog(directories[0]!);
  for (const operation of ["create", "put"]) {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      if (
        operation === "put" &&
        init.method === "POST" &&
        JSON.parse(String(init.body)).op === "presign"
      )
        return Response.json({
          uploads: [
            {
              id: h.file.id,
              key: h.file.id,
              target: { method: "PUT", url: `https://app.test/api/library/uploads/${h.file.id}` },
            },
          ],
        });
      if (operation === "put" && init.method === "POST")
        return new Response(
          JSON.stringify({
            uploadId: h.file.id,
            uploadUrl: `/api/library/uploads/${h.file.id}`,
            status: "pending",
            expiresAt: "2099-01-01T00:00:00Z",
          }),
        );
      return new Response(
        JSON.stringify({ message: "Cannot accept '/private/upload/Essay.docx'" }),
        { status: 422 },
      );
    });
    await expect(
      acquireAndUploadSource({ type: "local-file", path: h.path }, h.metadata, {
        appUrl: "https://app.test",
        avenireFetch: fetcher,
      }),
    ).rejects.toMatchObject({ operation: "upload" });
    const log = await readFile(path, "utf8");
    expect(log).toContain(`"operation":"${operation}"`);
    expect(log).toContain('"status":422');
    expect(log).toContain("Cannot accept 'Essay.docx'");
    expect(log).not.toContain("/private/upload");
    expect(log).not.toContain("open document original bytes");
  }
});
