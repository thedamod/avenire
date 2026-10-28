import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createHash } from "node:crypto";
import { MAX_SOURCE_UPLOAD_BYTES } from "@avenire/contracts";
import { kindForFile, mimeForFile, uploadSource } from "./uploadSource";

const uploadId = "e4d490a1-9fb1-48f1-9996-aa4f30b51b44";
const uploadUrl = `/api/library/uploads/${uploadId}`;
const ticket = { uploadId, uploadUrl, expiresAt: "2026-10-21T20:00:00Z", status: "pending" };
const saved = {
  id: "source-1",
  title: "Study.md",
  kind: "document",
  placement: "inbox",
  source: "upload",
  tags: [],
  contentModifiedAt: null,
  archivedAt: null,
  sourceUrl: null,
  storageKey: "sources/study",
  mimeType: "text/markdown",
  sizeBytes: 5,
  captureId: null,
  folderIds: [],
  origin: null,
  access: "open",
  mediaPositionSec: null,
  preview: null,
  purgeAt: null,
  createdAt: "2026-10-21T19:00:00Z",
  updatedAt: "2026-10-21T19:00:00Z",
};

afterEach(() => vi.unstubAllGlobals());

function mockBrowser() {
  vi.stubGlobal("window", { location: { origin: "https://app.test" } });
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("manual source upload", () => {
  it("resolves files with missing or generic browser MIME types", () => {
    for (const type of ["", "application/octet-stream"]) {
      const file = new File(["study"], "Study.MD", { type });
      expect(mimeForFile(file)).toBe("text/markdown");
      expect(kindForFile(file)).toBe("document");
    }
    expect(kindForFile(new File(["{}"], "data.json", { type: "application/json" }))).toBe(
      "document",
    );
    expect(kindForFile(new File(["video"], "lecture.mov"))).toBe("video");
  });

  it("rejects unsupported MIME types, empty files and oversized files before creating tickets", async () => {
    const fetcher = mockBrowser();
    await Promise.all(
      [
        new File(["svg"], "drawing.svg", { type: "image/svg+xml" }),
        new File(["zip"], "fake.pdf", { type: "application/zip" }),
        new File([], "empty.pdf", { type: "application/pdf" }),
      ].map(async (file) => {
        await expect(uploadSource(file)).rejects.toThrow();
      }),
    );
    const large = new File(["x"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(large, "size", { value: MAX_SOURCE_UPLOAD_BYTES + 1 });
    await expect(uploadSource(large)).rejects.toThrow("256 MB");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends verified metadata and delegates the upload protocol to storage", async () => {
    const fetcher = mockBrowser();
    fetcher.mockImplementation(async (input, init) => {
      const url = new URL(String(input), "https://app.test");
      if (url.pathname === "/api/library/uploads") return Response.json(ticket);
      if (init.method === "PUT") return Response.json(saved);
      const body = JSON.parse(init.body);
      if (body.op === "presign")
        return Response.json({
          uploads: [
            {
              id: uploadId,
              key: uploadId,
              target: {
                method: "PUT",
                url: new URL(uploadUrl, "https://app.test").href,
                headers: { "content-type": "text/markdown" },
              },
            },
          ],
        });
      return Response.json({
        files: [{ key: uploadId, size: 5, type: "text/markdown" }],
        sourceFile: saved,
      });
    });
    const file = new File(["study"], "Study.md");
    const onStage = vi.fn();
    expect(await uploadSource(file, { idempotencyKey: uploadId, onStage })).toEqual(saved);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({
      idempotencyKey: uploadId,
      title: "Study.md",
      kind: "document",
      mimeType: "text/markdown",
      sizeBytes: 5,
      sha256: createHash("sha256").update("study").digest("hex"),
    });
    expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
      "POST",
      "POST",
      "PUT",
      "POST",
    ]);
    expect(onStage.mock.calls.flat()).toEqual(["preparing", "uploading", "saving"]);
  });

  it("skips the entire transfer when the ticket already has a completed file", async () => {
    const fetcher = mockBrowser();
    fetcher.mockResolvedValueOnce(Response.json({ ...ticket, status: "completed", file: saved }));
    expect(await uploadSource(new File(["study"], "Study.md"))).toEqual(saved);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not transfer bytes when ticket creation fails or gives another origin", async () => {
    const fetcher = mockBrowser();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const file = new File(["study"], "Study.md");
    await expect(uploadSource(file)).rejects.toThrow("401");
    fetcher.mockResolvedValueOnce(
      Response.json({ ...ticket, uploadUrl: "https://other.test/upload" }),
    );
    await expect(uploadSource(file)).rejects.toThrow("Unexpected upload destination");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
