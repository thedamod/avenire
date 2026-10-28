import * as Schema from "effect/Schema";
import { CreateSourceUpload } from "@avenire/contracts";
import { HashLru } from "./hash-cache.ts";
import { LocalOriginRegistry } from "./registry.ts";
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
  origin: null,
  access: "open",
  mediaPositionSec: null,
  preview: null,
  purgeAt: null,
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
    completedFile?: boolean;
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
        // Exercise the server's strict JSON boundary, not just a fixture which accepts any body.
        try {
          Schema.decodeUnknownSync(CreateSourceUpload)(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
            {
              onExcessProperty: "error",
            },
          );
        } catch {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "Invalid request parameters." }));
          return;
        }
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            uploadId: id,
            uploadUrl: options.uploadUrl ?? `/api/library/uploads/${id}`,
            expiresAt: options.expiresAt ?? "2099-01-01T00:00:00Z",
            status: options.completed ? "completed" : "pending",
            ...(options.completedFile ? { file } : {}),
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
  it("sends origin/access and skips PUT for a completed ticket with its LibraryFile, persisting native origin on a dedupe hit", async () => {
    const directory = await temp();
    const path = join(directory, "study.pdf");
    await writeFile(path, bytes);
    const registry = new LocalOriginRegistry(join(directory, "registry.json"));
    await registry.load();
    const app = await appHarness({
      completed: true,
      completedFile: true,
      expiresAt: "2000-01-01T00:00:00Z",
    });
    const origin = {
      _tag: "LocalFile" as const,
      deviceId: "install",
      deviceName: "Student laptop",
      platform: "linux" as const,
      fileName: "study.pdf",
      capturedAt: "2026-10-26T00:00:00Z",
    };
    const result = await acquireAndUploadSource(
      { type: "local-file", path },
      { ...metadata, access: "open" },
      {
        ...app,
        localOrigin: origin,
        onLocalUploaded: (file, local) => registry.record("alice", file.id, local),
      },
    );
    expect(result.id).toBe(id);
    expect(app.requests.map((entry) => entry.method)).toEqual(["POST"]);
    const payload = JSON.parse(app.requests[0]!.body.toString());
    expect(payload.origin).toEqual({
      ...origin,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
    });
    expect(payload.access).toBe("open");
    expect(JSON.stringify(payload)).not.toContain(directory);
    const restored = new LocalOriginRegistry(join(directory, "registry.json"));
    await restored.load();
    expect(restored.get("alice", id)).toMatchObject({
      path,
      sha256: payload.sha256,
      sizeBytes: bytes.length,
    });
  });

  it("reuses a native hash only for the same path/size/mtime and hashes changed bytes", async () => {
    const directory = await temp();
    const path = join(directory, "study.pdf");
    await writeFile(path, bytes);
    const cache = new HashLru();
    const app = await appHarness({ completed: true, completedFile: true });
    const acquire = () =>
      acquireAndUploadSource({ type: "local-file", path }, metadata, { ...app, hashCache: cache });
    await acquire();
    await acquire();
    await writeFile(path, Buffer.from("changed original"));
    await acquire();
    const payloads = app.requests
      .filter((request) => request.method === "POST")
      .map((request) => JSON.parse(request.body.toString()));
    expect(payloads[0].sha256).toBe(payloads[1].sha256);
    expect(payloads[2].sha256).toBe(createHash("sha256").update("changed original").digest("hex"));
  });

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
      transport: "direct",
      ...metadata,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(JSON.stringify(payload)).not.toContain(directory);
    expect(app.requests[1]!.body).toEqual(bytes);
    expect(app.requests.every((request) => request.cookie === "avenire=session")).toBe(true);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it("never hand-sets headers Electron's network layer rejects (net::ERR_INVALID_ARGUMENT)", async () => {
    const directory = await temp();
    const path = join(directory, "lecture.pdf");
    await writeFile(path, bytes);
    const app = await appHarness();
    // Electron's net.fetch throws for these instead of letting the request through.
    const restricted = [
      "content-length",
      "host",
      "trailer",
      "te",
      "upgrade",
      "cookie2",
      "keep-alive",
      "transfer-encoding",
    ];
    const electronLike: AvenireUploadFetch = (url, init) => {
      const headers = new Headers(init.headers);
      for (const name of restricted)
        if (headers.has(name)) return Promise.reject(new TypeError("net::ERR_INVALID_ARGUMENT"));
      return app.avenireFetch(url, init);
    };
    const result = await acquireAndUploadSource({ type: "local-file", path }, metadata, {
      ...app,
      avenireFetch: electronLike,
    });
    expect(result.id).toBe(id);
    expect(app.requests.map((request) => request.method)).toEqual(["POST", "PUT"]);
    expect(app.requests[1]!.body).toEqual(bytes);
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
