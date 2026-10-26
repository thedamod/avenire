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

  it("sends verified metadata followed by the original bytes and returns the source", async () => {
    const fetcher = mockBrowser();
    fetcher
      .mockResolvedValueOnce(Response.json(ticket))
      .mockResolvedValueOnce(Response.json(saved));
    const file = new File(["study"], "Study.md");
    const onStage = vi.fn();
    expect(await uploadSource(file, { idempotencyKey: uploadId, onStage })).toEqual(saved);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("/api/library/uploads");
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({
      idempotencyKey: uploadId,
      title: "Study.md",
      kind: "document",
      mimeType: "text/markdown",
      sizeBytes: 5,
      sha256: createHash("sha256").update("study").digest("hex"),
    });
    expect(fetcher.mock.calls[1]![0].toString()).toBe(`https://app.test${uploadUrl}`);
    expect(fetcher.mock.calls[1]![1]).toEqual({
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "text/markdown" },
      body: file,
    });
    expect(onStage.mock.calls).toEqual([["preparing"], ["uploading"]]);
  });

  it("reuses the ticket identity after an uncertain PUT response", async () => {
    const fetcher = mockBrowser();
    fetcher
      .mockResolvedValueOnce(Response.json(ticket))
      .mockRejectedValueOnce(new TypeError("Network error"))
      .mockResolvedValueOnce(Response.json({ ...ticket, status: "completed" }))
      .mockResolvedValueOnce(Response.json(saved));
    const file = new File(["study"], "Study.md");
    await expect(uploadSource(file, { idempotencyKey: uploadId })).rejects.toThrow("Network error");
    await expect(uploadSource(file, { idempotencyKey: uploadId })).resolves.toEqual(saved);
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(
      JSON.parse(fetcher.mock.calls[2]![1].body),
    );
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

  it("reports transfer errors and rejects malformed completion data", async () => {
    const fetcher = mockBrowser();
    fetcher
      .mockResolvedValueOnce(Response.json(ticket))
      .mockResolvedValueOnce(new Response(null, { status: 422 }));
    const file = new File(["study"], "Study.md");
    await expect(uploadSource(file)).rejects.toThrow("422");
    fetcher
      .mockResolvedValueOnce(Response.json(ticket))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    await expect(uploadSource(file)).rejects.toThrow();
  });
});

class UploadRequest extends EventTarget {
  static requests: UploadRequest[] = [];
  upload = new EventTarget();
  status = 200;
  responseText = JSON.stringify(saved);
  withCredentials = false;
  timeout = 0;
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  constructor() {
    super();
    UploadRequest.requests.push(this);
  }
}

describe("browser transfer progress", () => {
  function setup() {
    UploadRequest.requests = [];
    const fetcher = mockBrowser();
    fetcher.mockResolvedValue(Response.json(ticket));
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
  }

  it("reports real byte percentage, then waits for server persistence before completing", async () => {
    setup();
    const onProgress = vi.fn(),
      onStage = vi.fn(),
      finished = vi.fn();
    const file = new File(["study"], "Study.md");
    const pending = uploadSource(file, { onProgress, onStage }).then(finished);
    await vi.waitFor(() => expect(UploadRequest.requests).toHaveLength(1));
    const request = UploadRequest.requests[0]!;
    expect(request.withCredentials).toBe(true);
    expect(request.send).toHaveBeenCalledWith(file);
    request.upload.dispatchEvent(
      Object.assign(new Event("progress"), { lengthComputable: true, loaded: 2, total: 5 }),
    );
    expect(onProgress).toHaveBeenLastCalledWith(40);
    request.upload.dispatchEvent(new Event("load"));
    expect(onProgress).toHaveBeenLastCalledWith(100);
    expect(onStage).toHaveBeenLastCalledWith("saving");
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    request.dispatchEvent(new Event("load"));
    await pending;
    expect(finished).toHaveBeenCalledWith(saved);
  });

  it("surfaces a failed server commit after all bytes transferred", async () => {
    setup();
    const pending = uploadSource(new File(["study"], "Study.md"));
    const rejected = expect(pending).rejects.toThrow("422");
    await vi.waitFor(() => expect(UploadRequest.requests).toHaveLength(1));
    const request = UploadRequest.requests[0]!;
    request.upload.dispatchEvent(new Event("load"));
    request.status = 422;
    request.dispatchEvent(new Event("load"));
    await rejected;
  });

  it("surfaces interrupted transfers for retry", async () => {
    setup();
    const pending = uploadSource(new File(["study"], "Study.md"));
    const rejected = expect(pending).rejects.toThrow("Connection lost");
    await vi.waitFor(() => expect(UploadRequest.requests).toHaveLength(1));
    UploadRequest.requests[0]!.dispatchEvent(new Event("error"));
    await rejected;
  });
});
