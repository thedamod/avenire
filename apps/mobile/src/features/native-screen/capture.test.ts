import { beforeEach, expect, it, vi } from "vite-plus/test";
const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  bridge: {
    bindOwner: vi.fn(),
    captureWork: vi.fn(),
    captureRead: vi.fn(),
    captureUpdate: vi.fn(),
    captureFinished: vi.fn(),
    captureSend: vi.fn(),
    captureCancelTransfer: vi.fn(),
    captureDefer: vi.fn(),
  },
  auth: vi.fn(),
  upload: vi.fn(),
  fetch: vi.fn(),
  rpc: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("./native", () => ({ nativeScreenBridge: () => h.bridge }));
vi.mock("../../state/auth", () => ({
  apiUrl: "https://app.test",
  authClient: { getSession: h.auth },
  getCookieHeader: async () => ({ Cookie: "session=owner" }),
}));
vi.mock("@avenire/storage/client", () => ({ uploadSourceTicket: h.upload }));
vi.mock("@avenire/client-runtime/rpc", () => ({
  makeClientRuntime: () => ({}),
  disposeClientRuntime: h.dispose,
  call: h.rpc,
}));
import { runCaptureTask } from "./capture";
const id = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";
const origin = {
  _tag: "Screen",
  captureId: id,
  deviceId: "phone",
  deviceName: "Phone",
  platform: "android",
  appPackage: "com.android.chrome",
  appName: "Chrome",
  capturedAt: "2026-11-15T00:00:00Z",
  sha256: "a".repeat(64),
  sizeBytes: 5,
  scope: "visible-screen",
  note: "Important equation",
};
const saved = {
  id: "file-test",
  title: "Screen from Chrome",
  kind: "image",
  placement: "inbox",
  source: "capture",
  tags: [],
  contentModifiedAt: null,
  archivedAt: null,
  sourceUrl: null,
  origin,
  access: "open",
  storageKey: "source/test",
  mimeType: "image/png",
  sizeBytes: 5,
  captureId: null,
  folderIds: [],
  mediaPositionSec: null,
  preview: null,
  purgeAt: null,
  createdAt: origin.capturedAt,
  updatedAt: origin.capturedAt,
};
const ticket = {
  uploadId: ticketId,
  uploadUrl: `/api/library/uploads/${ticketId}`,
  expiresAt: origin.capturedAt,
  status: "pending",
};
beforeEach(() => {
  vi.resetAllMocks();
  h.row = {
    id,
    owner: "owner",
    title: "Screen from Chrome",
    kind: "image",
    mimeType: "image/png",
    sizeBytes: 5,
    sha256: origin.sha256,
    origin,
    uri: "file:///private/capture.source",
    undo: false,
    attempted: false,
    phase: "queued",
    leaseUntil: 0,
    nextAt: 0,
  };
  h.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  h.bridge.captureWork.mockImplementation(async () => {
    if (
      ["ready", "partial", "undone", "failed"].includes(String(h.row.phase)) ||
      Number(h.row.leaseUntil) > Date.now() ||
      Number(h.row.nextAt) > Date.now()
    )
      return null;
    h.row.leaseUntil = Date.now() + 300000;
    return JSON.stringify(h.row);
  });
  h.bridge.captureRead.mockImplementation(async () => JSON.stringify(h.row));
  h.bridge.captureUpdate.mockImplementation(async (_id, _owner, json) => {
    Object.assign(h.row, JSON.parse(json));
    if (h.row.undo && h.row.phase !== "undone") h.row.phase = "undoing";
  });
  h.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json(ticket);
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json({
      ticket: { ...ticket, status: "completed", file: saved },
      ingestion: {
        id: "job-test",
        fileId: saved.id,
        status: "indexed",
        attempts: 1,
        error: null,
        coverage: { status: "full", parts: [] },
        createdAt: origin.capturedAt,
        updatedAt: origin.capturedAt,
      },
    });
  });
  vi.stubGlobal("fetch", h.fetch);
  h.upload.mockResolvedValue(saved);
});
it("publishes once, tracks extraction and keeps paths out of server metadata", async () => {
  await runCaptureTask();
  expect(h.row.phase).toBe("ready");
  expect(h.upload).toHaveBeenCalledOnce();
  const sent = JSON.parse(h.fetch.mock.calls.find(([, init]) => init?.method === "POST")![1].body);
  expect(sent.origin).toMatchObject({ scope: "visible-screen", note: "Important equation" });
  expect(JSON.stringify(sent)).not.toContain("file://");
  expect(h.bridge.captureFinished).toHaveBeenCalledOnce();
});
it("records a server cancellation instead of uploading an undo request", async () => {
  h.row.undo = true;
  h.row.phase = "undoing";
  await runCaptureTask();
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.row.phase).toBe("undone");
  expect(h.fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
});
it("settles undo even when publication wins the transfer race", async () => {
  h.upload.mockImplementation(async () => {
    h.row.undo = true;
    return saved;
  });
  await runCaptureTask();
  expect(h.row.phase).toBe("undone");
  expect(h.fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
});
it("settles an interrupted upload's undo without waiting for the network backoff", async () => {
  h.upload.mockImplementation(async () => {
    h.row.undo = true;
    throw new Error("Capture cancelled.");
  });
  await runCaptureTask();
  expect(h.row.phase).toBe("undone");
  expect(h.upload).toHaveBeenCalledOnce();
  expect(h.fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
});
it("does not re-extract an already indexed capture when retrying its receipt", async () => {
  Object.assign(h.row, { ticket: ticketId, fileId: saved.id, retry: true });
  await runCaptureTask();
  expect(h.row.phase).toBe("ready");
  expect(h.row.retry).toBe(false);
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
});
it("keeps failed uploads queued with backoff and never reports ready", async () => {
  h.upload.mockRejectedValue(new Error("Offline"));
  await runCaptureTask();
  expect(h.row.phase).toBe("waiting");
  expect(h.row.nextAt).toBeGreaterThan(Date.now());
  expect(h.row.fileId).toBeUndefined();
});
it("never sends an outbox record belonging to another account", async () => {
  h.row.owner = "other";
  await runCaptureTask();
  expect(h.fetch).not.toHaveBeenCalled();
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.bridge.captureDefer).toHaveBeenCalledOnce();
});
it("coalesces duplicate Headless JS wakeups", async () => {
  const first = runCaptureTask();
  const second = runCaptureTask();
  await Promise.all([first, second]);
  expect(h.upload).toHaveBeenCalledOnce();
});
