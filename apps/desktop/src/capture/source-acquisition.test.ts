import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  acquireAndUploadSource,
  type AvenireUploadFetch,
  type DeviceSessionFetch,
} from "./source-acquisition.ts";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bytes = Buffer.from("original PDF/audio bytes\u0000\u00ff");
const metadata = {
  idempotencyKey: id,
  title: "Study source",
  kind: "pdf" as const,
  mimeType: "application/pdf",
};
const file = {
  id,
  kind: "pdf",
  title: "Study source",
  placement: "inbox",
  source: "upload",
  tags: [],
  contentModifiedAt: null,
  archivedAt: null,
  sourceUrl: null,
  storageKey: null,
  mimeType: "application/pdf",
  sizeBytes: bytes.length,
  captureId: null,
  folderIds: [],
  mediaPositionSec: null,
  createdAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
const temp = async () => {
  const path = await mkdtemp(join(tmpdir(), "avenire-device-test-"));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
};
const listen = async (handler: http.RequestListener) => {
  const server = http.createServer((request, response) => {
    request.on("error", () => {});
    response.on("error", () => {});
    handler(request, response);
  });
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  cleanups.push(
    () =>
      new Promise<void>((accept) => {
        server.closeAllConnections();
        server.close(() => accept());
      }),
  );
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No local test port");
  return `http://127.0.0.1:${address.port}`;
};
const appHarness = async (
  options: {
    rejectPut?: boolean;
    uploadUrl?: string;
    onPut?: () => void;
    stallPut?: boolean;
    completed?: boolean;
    expiresAt?: string;
    invalidPutResponse?: boolean;
  } = {},
) => {
  const requests: Array<{ method: string; cookie: string | undefined; body: Buffer }> = [];
  const appUrl = await listen((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method!,
        cookie: request.headers.cookie,
        body: Buffer.concat(chunks),
      });
      if (request.method === "POST") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            uploadId: id,
            uploadUrl: options.uploadUrl ?? `/api/library/uploads/${id}`,
            expiresAt: options.expiresAt ?? "2099-01-01T00:00:00Z",
            status: options.completed ? "completed" : "pending",
          }),
        );
      } else if (request.method === "DELETE") {
        response.writeHead(204);
        response.end();
      } else {
        options.onPut?.();
        if (options.stallPut) return;
        response.writeHead(options.rejectPut ? 500 : 200, { "content-type": "application/json" });
        response.end(options.invalidPutResponse ? "invalid-json" : JSON.stringify(file));
      }
    });
  });
  const avenireFetch: AvenireUploadFetch = (url, init) =>
    fetch(url, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers)), cookie: "avenire=session" },
    });
  return { appUrl, avenireFetch, requests };
};

describe("device source byte acquisition backend", () => {
  it("retries completed tickets past their original expiry without cancelling finalized uploads", async () => {
    for (const invalidPutResponse of [false, true]) {
      const tempRoot = await temp();
      const app = await appHarness({
        completed: true,
        expiresAt: "2000-01-01T00:00:00Z",
        invalidPutResponse,
      });
      const upload = acquireAndUploadSource(
        { type: "browser-blob", blob: new Blob([bytes]) },
        metadata,
        { ...app, tempRoot },
      );
      if (invalidPutResponse) await expect(upload).rejects.toMatchObject({ operation: "upload" });
      else expect((await upload).id).toBe(id);
      expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
      expect(await readdir(tempRoot)).toEqual([]);
    }
  });
  it("streams a local file, hashes exact bytes, and sends no local path or source credentials", async () => {
    const directory = await temp();
    const tempRoot = await temp();
    const path = join(directory, "personal-original.pdf");
    await writeFile(path, bytes);
    const app = await appHarness();
    const result = await acquireAndUploadSource({ type: "local-file", path }, metadata, {
      ...app,
      tempRoot,
    });
    expect(result.id).toBe(id);
    expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
    const payload = JSON.parse(app.requests[0]!.body.toString());
    expect(payload).toEqual({
      ...metadata,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(JSON.stringify(payload)).not.toContain(directory);
    expect(app.requests[1]!.body).toEqual(bytes);
    expect(app.requests.every((request) => request.cookie === "avenire=session")).toBe(true);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("uses the authorized device session only for source GET and strips URL tokens from provenance", async () => {
    const tempRoot = await temp();
    let sourceCookie: string | undefined;
    const sourceOrigin = await listen((request, response) => {
      sourceCookie = request.headers.cookie;
      response.setHeader("content-type", "application/pdf");
      response.write(bytes.subarray(0, 5));
      response.end(bytes.subarray(5));
    });
    const app = await appHarness();
    const sourceSessionFetch: DeviceSessionFetch = (url, init) =>
      fetch(url, {
        ...init,
        headers: { cookie: "publisher=authorized", authorization: "Bearer source-only" },
      });
    await acquireAndUploadSource(
      { type: "session-url", url: `${sourceOrigin}/private.pdf?token=secret#private` },
      metadata,
      { ...app, tempRoot, sourceSessionFetch },
    );
    expect(sourceCookie).toBe("publisher=authorized");
    expect(app.requests[1]!.body).toEqual(bytes);
    const payload = JSON.parse(app.requests[0]!.body.toString());
    expect(payload.sourceUrl).toBe(`${sourceOrigin}/private.pdf`);
    expect(JSON.stringify(payload)).not.toMatch(/secret|Bearer|publisher/);
    expect(app.requests.every((request) => request.cookie === "avenire=session")).toBe(true);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("uploads a browser-provided page snapshot Blob unchanged", async () => {
    const tempRoot = await temp();
    const app = await appHarness();
    const snapshot = "<html><body>Authorized page snapshot</body></html>";
    await acquireAndUploadSource(
      { type: "browser-blob", blob: new Blob([snapshot]) },
      { ...metadata, kind: "web-page", mimeType: "text/html; charset=utf-8" },
      { ...app, tempRoot },
    );
    expect(app.requests[1]!.body.toString()).toBe(snapshot);
    const payload = JSON.parse(app.requests[0]!.body.toString());
    expect(payload.mimeType).toBe("text/html");
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("enforces streamed byte limits despite absent or dishonest Content-Length", async () => {
    for (const declared of [undefined, "1", "9999"]) {
      const tempRoot = await temp();
      const app = await appHarness();
      let cancelled = false;
      const sourceSessionFetch: DeviceSessionFetch = async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: declared === undefined ? {} : { "content-length": declared } },
        );
      await expect(
        acquireAndUploadSource(
          { type: "session-url", url: "https://publisher.example/private.pdf" },
          metadata,
          { ...app, tempRoot, maxBytes: 5, sourceSessionFetch },
        ),
      ).rejects.toMatchObject({ operation: "acquire" });
      expect(app.requests).toEqual([]);
      expect(cancelled).toBe(true);
      expect(await readdir(tempRoot)).toEqual([]);
    }
  });

  it("rejects empty sources, oversized Blobs and local files before upload", async () => {
    const directory = await temp();
    const path = join(directory, "audio.mp3");
    await writeFile(path, bytes);
    for (const source of [
      { type: "local-file" as const, path },
      { type: "browser-blob" as const, blob: new Blob([bytes]) },
      { type: "browser-blob" as const, blob: new Blob([]) },
    ]) {
      const tempRoot = await temp();
      const app = await appHarness();
      await expect(
        acquireAndUploadSource(source, metadata, { ...app, tempRoot, maxBytes: 5 }),
      ).rejects.toMatchObject({ operation: "acquire" });
      expect(app.requests).toEqual([]);
      expect(await readdir(tempRoot)).toEqual([]);
    }
  });

  it("cannot raise the contract's 256 MiB cap and rejects file-path provenance", async () => {
    const tempRoot = await temp();
    const app = await appHarness();
    const blob = new Blob([]);
    Object.defineProperty(blob, "size", { value: 256 * 1024 * 1024 + 1 });
    await expect(
      acquireAndUploadSource({ type: "browser-blob", blob }, metadata, {
        ...app,
        tempRoot,
        maxBytes: 1024 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ operation: "acquire" });
    await expect(
      acquireAndUploadSource(
        { type: "browser-blob", blob: new Blob([bytes]) },
        { ...metadata, sourceUrl: "file:///private/study.pdf" },
        { ...app, tempRoot },
      ),
    ).rejects.toMatchObject({ operation: "acquire" });
    expect(app.requests).toEqual([]);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("follows device-session redirects while the session adapter applies origin credential policy", async () => {
    const tempRoot = await temp();
    const app = await appHarness();
    let destinationRequests = 0;
    let destinationCookie: string | undefined;
    let sourceCookie: string | undefined;
    const destination = await listen((request, response) => {
      destinationRequests++;
      destinationCookie = request.headers.cookie;
      response.setHeader("content-type", "application/pdf");
      response.end(bytes);
    });
    const sourceOrigin = await listen((request, response) => {
      sourceCookie = request.headers.cookie;
      response.writeHead(302, { location: `${destination}/private.pdf` });
      response.end();
    });
    const sourceSessionFetch: DeviceSessionFetch = (url, init) =>
      fetch(url, { ...init, headers: { cookie: "publisher=authorized" } });
    await acquireAndUploadSource(
      { type: "session-url", url: `${sourceOrigin}/redirect` },
      metadata,
      { ...app, tempRoot, sourceSessionFetch },
    );
    expect(sourceCookie).toBe("publisher=authorized");
    expect(destinationCookie).toBeUndefined();
    expect(destinationRequests).toBe(1);
    expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
    expect(app.requests[1]!.body).toEqual(bytes);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects a claimed PDF when the authorized URL returns login HTML", async () => {
    const tempRoot = await temp();
    const app = await appHarness();
    const sourceOrigin = await listen((_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<html>Sign in</html>");
    });
    await expect(
      acquireAndUploadSource(
        { type: "session-url", url: `${sourceOrigin}/private.pdf` },
        metadata,
        { ...app, tempRoot, sourceSessionFetch: fetch },
      ),
    ).rejects.toMatchObject({
      operation: "acquire",
      cause: expect.objectContaining({ message: expect.stringContaining("MIME mismatch") }),
    });
    expect(app.requests).toEqual([]);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("rejects off-origin and unexpected upload paths without sending bytes or cancellation there", async () => {
    for (const uploadUrl of [
      "https://attacker.example/api/library/uploads/" + id,
      "/api/auth/session",
      `/api/library/uploads/${id}?token=secret`,
    ]) {
      const tempRoot = await temp();
      const app = await appHarness({ uploadUrl });
      await expect(
        acquireAndUploadSource({ type: "browser-blob", blob: new Blob([bytes]) }, metadata, {
          ...app,
          tempRoot,
        }),
      ).rejects.toMatchObject({ operation: "upload" });
      expect(app.requests.map((request) => request.method)).toEqual(["POST"]);
      expect(await readdir(tempRoot)).toEqual([]);
    }
  });

  it("cancels the approved ticket and removes its tempfile after PUT failure", async () => {
    const tempRoot = await temp();
    const app = await appHarness({ rejectPut: true });
    await expect(
      acquireAndUploadSource({ type: "browser-blob", blob: new Blob([bytes]) }, metadata, {
        ...app,
        tempRoot,
      }),
    ).rejects.toMatchObject({ operation: "upload" });
    expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT", "DELETE"]);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("aborts a stalled source and removes temporary state without creating a ticket", async () => {
    const tempRoot = await temp();
    const app = await appHarness();
    const sourceOrigin = await listen((_request, response) => {
      response.writeHead(200);
      response.write("bytes");
    });
    await expect(
      acquireAndUploadSource({ type: "session-url", url: `${sourceOrigin}/audio` }, metadata, {
        ...app,
        tempRoot,
        sourceSessionFetch: fetch,
        timeoutMs: 150,
      }),
    ).rejects.toMatchObject({ operation: "acquire" });
    expect(app.requests).toEqual([]);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("uses a fresh cancellation deadline after caller abort during PUT", async () => {
    const tempRoot = await temp();
    const controller = new AbortController();
    const app = await appHarness({ stallPut: true, onPut: () => controller.abort() });
    await expect(
      acquireAndUploadSource({ type: "browser-blob", blob: new Blob([bytes]) }, metadata, {
        ...app,
        tempRoot,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ operation: "upload" });
    expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT", "DELETE"]);
    expect(await readdir(tempRoot)).toEqual([]);
  });
});
