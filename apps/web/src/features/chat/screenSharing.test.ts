import { expect, it, vi } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ReadScreenResult, ScreenSharingDisabled } from "@avenire/contracts";
import type { ClientRuntime } from "@avenire/client-runtime/rpc";
import { ruthToolSpecs } from "@avenire/ai/tools";

const mocks = vi.hoisted(() => ({ options: undefined as any, output: vi.fn() }));
vi.mock("@ai-sdk/react", () => ({
  Chat: class {
    constructor(options: unknown) {
      mocks.options = options;
    }
    addToolOutput = mocks.output;
    "~registerStatusCallback"() {}
    "~registerMessagesCallback"() {}
  },
}));
vi.mock("@avenire/client-runtime/rpc", () => ({ invalidate: vi.fn(), call: vi.fn() }));
vi.mock("./pageContext.ts", () => ({ measurePage: vi.fn() }));
import { ThreadChat } from "./chatStore";

it("continues to the model with a validated actionable disabled result and no image", async () => {
  const entry = new ThreadChat({} as ClientRuntime, "test", undefined, () => {});
  const disabled = Schema.decodeUnknownSync(ScreenSharingDisabled)({
    status: "disabled",
    message:
      "Screen sharing is off. Enable Share screen with Ava in Settings → Capture to let me explain what’s on your screen.",
  });
  const reader = vi.fn(async () => disabled);
  entry.setScreenReader(reader);
  await mocks.options.onToolCall({
    toolCall: { dynamic: false, toolName: "read_screen", toolCallId: "call" },
  });
  expect(reader).toHaveBeenCalledOnce();
  expect(mocks.output).toHaveBeenCalledWith({
    tool: "read_screen",
    toolCallId: "call",
    output: disabled,
  });
  expect(entry.screenContext).toBeUndefined();
  expect(Schema.decodeUnknownSync(ReadScreenResult)(disabled)).toEqual(disabled);
  expect(ruthToolSpecs.read_screen.description).toContain("no screenshot was captured or shared");
  expect(ruthToolSpecs.read_screen.description).toContain("Do not retry");
  expect(ruthToolSpecs.read_screen.description).toContain("unrelated questions");
});

it("accepts persisted read_screen outputs from before the status field was introduced", () => {
  const legacy = { capturedAt: "2026-11-12T12:00:00Z", width: 1280, height: 720 };
  expect(Schema.decodeUnknownSync(ReadScreenResult)(legacy)).toEqual(legacy);
  expect(Schema.decodeUnknownSync(ReadScreenResult)({ ...legacy, status: "captured" })).toEqual({
    ...legacy,
    status: "captured",
  });
});
