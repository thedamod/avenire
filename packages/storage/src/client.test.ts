import { afterEach, expect, it, vi } from "@effect/vitest";
import { uploadSourceTicket } from "./client.ts";
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

const endpoint = new URL(
  "https://app.test/api/library/uploads/e4d490a1-9fb1-48f1-9996-aa4f30b51b44",
);
const id = endpoint.pathname.split("/").at(-1)!;
afterEach(() => vi.unstubAllGlobals());

it.each(["PUT", "POST"] as const)(
  "uses SDK %s transport without sending app credentials to storage",
  async (method) => {
    const target =
      method === "PUT"
        ? {
            method,
            url: "https://bucket.test/source",
            headers: { "content-type": "text/markdown" },
          }
        : { method, url: "https://bucket.test", fields: { key: "source", policy: "signed" } };
    const provider = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", provider);
    const appFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const action = JSON.parse(init.body as string);
      if (action.op === "presign") return Response.json({ uploads: [{ id, key: id, target }] });
      expect(action).toEqual({ op: "complete", completions: [{ id, key: id }] });
      return Response.json({
        files: [{ key: id, size: 5, type: "text/markdown" }],
        sourceFile: saved,
      });
    });
    const body = new File(["study"], "Study.md");
    expect(
      await uploadSourceTicket(endpoint, body, { contentType: "text/markdown", appFetch }),
    ).toEqual(saved);
    expect(provider).toHaveBeenCalledTimes(1);
    const init = provider.mock.calls[0]![1];
    expect(init).toMatchObject({ method, credentials: "omit", redirect: "error" });
    expect(new Headers(init.headers).has("cookie")).toBe(false);
    if (method === "POST") {
      expect(init.body).toBeInstanceOf(FormData);
      expect(init.body.get("policy")).toBe("signed");
      expect(await init.body.get("file").text()).toBe("study");
    } else expect(await init.body.text()).toBe("study");
    for (const [, init] of appFetch.mock.calls) expect(init.credentials).toBe("include");
  },
);

it("uses the same authenticated relay and refuses unverified completion data", async () => {
  const provider = vi.fn();
  vi.stubGlobal("fetch", provider);
  const appFetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") {
      expect(await (init.body as Blob).text()).toBe("study");
      return Response.json(saved);
    }
    const action = JSON.parse(init.body as string);
    if (action.op === "presign")
      return Response.json({
        uploads: [{ id, key: id, target: { method: "PUT", url: endpoint.pathname } }],
      });
    return Response.json({ files: [{ key: id, size: 5, type: "text/markdown" }] });
  });
  await expect(
    uploadSourceTicket(endpoint, new Blob(["study"]), { contentType: "text/markdown", appFetch }),
  ).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
  expect(appFetch.mock.calls.map(([, init]) => init.method)).toEqual(["POST", "PUT", "POST"]);
});

it("blocks insecure or credential-bearing storage targets before sending bytes", async () => {
  const provider = vi.fn();
  const browserTransport = vi.fn();
  vi.stubGlobal("XMLHttpRequest", browserTransport);
  vi.stubGlobal("fetch", provider);
  for (const url of ["http://bucket.test/source", "https://user:secret@bucket.test/source"]) {
    const appFetch = vi.fn(async () =>
      Response.json({ uploads: [{ id, key: id, target: { method: "PUT", url } }] }),
    );
    await expect(
      uploadSourceTicket(endpoint, new Blob(["study"]), { contentType: "text/markdown", appFetch }),
    ).rejects.toThrow("Unexpected storage");
  }
  expect(provider).not.toHaveBeenCalled();
  expect(browserTransport).not.toHaveBeenCalled();
});

it("reports SDK browser byte progress and waits for the server's verified completion", async () => {
  class UploadRequest extends EventTarget {
    static latest: UploadRequest;
    upload = new EventTarget();
    status = 200;
    responseText = "{}";
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn();
    abort = () => this.dispatchEvent(new Event("abort"));
    constructor() {
      super();
      UploadRequest.latest = this;
    }
  }
  vi.stubGlobal("XMLHttpRequest", UploadRequest);
  let release!: (response: Response) => void;
  const completed = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const appFetch = vi.fn(async (_url: string, init: RequestInit) =>
    JSON.parse(init.body as string).op === "presign"
      ? Response.json({
          uploads: [{ id, key: id, target: { method: "PUT", url: endpoint.pathname } }],
        })
      : completed,
  );
  const onProgress = vi.fn(),
    onVerifying = vi.fn(),
    finished = vi.fn();
  const pending = uploadSourceTicket(endpoint, new File(["study"], "Study.md"), {
    contentType: "text/markdown",
    appFetch,
    onProgress,
    onVerifying,
  }).then(finished);
  await vi.waitFor(() => expect(UploadRequest.latest).toBeDefined());
  UploadRequest.latest.upload.dispatchEvent(
    Object.assign(new Event("progress"), { lengthComputable: true, loaded: 2, total: 5 }),
  );
  expect(onProgress).toHaveBeenLastCalledWith(2, 5);
  expect(finished).not.toHaveBeenCalled();
  UploadRequest.latest.dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(onVerifying).toHaveBeenCalledOnce());
  expect(finished).not.toHaveBeenCalled();
  release(
    Response.json({ files: [{ key: id, size: 5, type: "text/markdown" }], sourceFile: saved }),
  );
  await pending;
  expect(finished).toHaveBeenCalledWith(saved);
});
