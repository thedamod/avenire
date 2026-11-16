import { RuthChatRequest } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import { beforeEach, expect, it, vi } from "vite-plus/test";
const h = vi.hoisted(() => ({
  bridge: {
    bindOwner: vi.fn(),
    canShareScreen: vi.fn(),
    isSessionActive: vi.fn(),
    getScreenContext: vi.fn(),
    updateResponse: vi.fn(),
    presentAnnotations: vi.fn(),
  },
  auth: vi.fn(),
  rpc: vi.fn(),
  dispose: vi.fn(),
  bodies: [] as Record<string, unknown>[],
}));
vi.mock("./native", () => ({ nativeScreenBridge: () => h.bridge }));
vi.mock("../../state/auth", () => ({
  apiUrl: "https://example.test",
  authClient: { getSession: h.auth },
  getCookieHeader: async () => ({ Cookie: "session" }),
}));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("@avenire/client-runtime/rpc", () => ({
  makeClientRuntime: () => ({}),
  disposeClientRuntime: h.dispose,
  call: h.rpc,
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  DefaultChatTransport: class {
    private options: { prepareSendMessagesRequest: () => { body: Record<string, unknown> } };
    constructor(options: { prepareSendMessagesRequest: () => { body: Record<string, unknown> } }) {
      this.options = options;
    }
    async sendMessages() {
      const body = this.options.prepareSendMessagesRequest().body;
      Schema.decodeUnknownSync(RuthChatRequest)(body);
      h.bodies.push(body);
      return new ReadableStream({
        start(controller) {
          for (const chunk of [
            { type: "start", messageId: "reply" },
            { type: "text-start", id: "text" },
            { type: "text-delta", id: "text", delta: "A streamed answer" },
            { type: "text-end", id: "text" },
            { type: "finish", finishReason: "stop" },
          ])
            controller.enqueue(chunk);
          controller.close();
        },
      });
    }
  },
}));
import { runAvaTask } from "./task";
beforeEach(() => {
  vi.resetAllMocks();
  h.bodies.length = 0;
  h.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  h.bridge.isSessionActive.mockResolvedValue(true);
  h.bridge.canShareScreen.mockResolvedValue(true);
  h.rpc
    .mockResolvedValueOnce({ settings: { shareScreenWithAi: false } })
    .mockResolvedValueOnce({ id: "thread-test" });
});
it("streams a text-only reply back to the overlay when screen sharing is off", async () => {
  await runAvaTask({ session: "capture", question: "Explain this" });
  expect(h.bridge.getScreenContext).not.toHaveBeenCalled();
  expect(h.bodies[0]).not.toHaveProperty("screenContext");
  expect(h.bridge.updateResponse).toHaveBeenLastCalledWith(
    "capture",
    "A streamed answer",
    true,
    "thread-test",
  );
  expect(h.dispose).toHaveBeenCalledOnce();
});
it("shares the matching screenshot only with consent and enables annotation output", async () => {
  h.rpc.mockReset().mockResolvedValueOnce({ settings: { shareScreenWithAi: true } });
  const capture = {
    mimeType: "image/png",
    data: "aGVsbG8=",
    width: 10,
    height: 20,
    screenId: "mobile:capture",
    capturedAt: "now",
  };
  h.bridge.getScreenContext.mockResolvedValue(capture);
  await runAvaTask({ session: "capture", question: "Explain this", threadId: "thread-existing" });
  expect(h.bodies[0]).toMatchObject({
    threadId: "thread-existing",
    screenContext: capture,
    nativeAnnotationAvailable: true,
  });
  expect(h.rpc).toHaveBeenCalledOnce();
});
it("does not send after the overlay is closed", async () => {
  h.bridge.isSessionActive.mockResolvedValue(false);
  await runAvaTask({ session: "old", question: "Explain" });
  expect(h.bodies).toHaveLength(0);
  expect(h.rpc).not.toHaveBeenCalled();
});
it("shows sign-in errors in place without sending or navigating", async () => {
  h.auth.mockResolvedValue({ data: null });
  await runAvaTask({ session: "capture", question: "Explain" });
  expect(h.bodies).toHaveLength(0);
  expect(h.bridge.updateResponse).toHaveBeenLastCalledWith(
    "capture",
    expect.stringContaining("Sign in"),
    true,
    "",
  );
});

it("drops acquired pixels if the source becomes excluded before transport sends", async () => {
  h.rpc.mockReset().mockResolvedValue({ settings: { shareScreenWithAi: true } });
  h.bridge.getScreenContext.mockResolvedValue({
    mimeType: "image/png",
    data: "aGVsbG8=",
    width: 10,
    height: 20,
    screenId: "mobile:capture",
    capturedAt: "now",
  });
  h.bridge.canShareScreen.mockResolvedValue(false);
  await runAvaTask({ session: "capture", question: "Explain", threadId: "existing" });
  expect(h.bodies[0]).not.toHaveProperty("screenContext");
  expect(h.bodies[0]).not.toHaveProperty("nativeAnnotationAvailable");
});
