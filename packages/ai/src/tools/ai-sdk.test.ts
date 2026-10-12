import { Analytics } from "@avenire/shared/observability";
import { expect, it } from "@effect/vitest";
import { streamText, type ModelMessage } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

import { toAiSdkTools } from "./ai-sdk.ts";
import { ctx, recordingAnalytics } from "./test-support.ts";
import type { RuthKitServices } from "./library.ts";
import { RUTH_TOOL_SPECS } from "./specs.ts";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const archiveModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "archive_file",
          input: '{"fileId":"file"}',
        },
        { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
      ]),
    }),
  });
const finishModel = () =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start", warnings: [] },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
      ]),
    }),
  });
const collect = async (stream: AsyncIterable<unknown>) => {
  const parts: unknown[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
};
const setup = (fullAccess = false) => {
  let calls = 0;
  // Only the overridden implementation is called; no DB, storage or network layer is installed.
  const services = Context.make(
    Analytics,
    recordingAnalytics(),
  ) as Context.Context<RuthKitServices>;
  const adapter = toAiSdkTools(["archive_file"], { ...ctx, fullAccess }, services, {
    archive_file: (input) =>
      Effect.sync(() => {
        calls++;
        return { fileId: input.fileId, summary: "Archived" };
      }),
  });
  return { ...adapter, calls: () => calls };
};

for (const approved of [true, false])
  it.effect(
    `${approved ? "approval executes" : "denial never executes"} after a pending stream`,
    () =>
      Effect.promise(async () => {
        const fixture = setup();
        const messages: ModelMessage[] = [{ role: "user", content: "Archive it" }];
        const pending = streamText({
          model: archiveModel(),
          tools: fixture.tools,
          toolApproval: fixture.toolApproval,
          messages,
        });
        const parts = await collect(pending.fullStream);
        const approval = parts.find(
          (part): part is { type: "tool-approval-request"; approvalId: string } =>
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "tool-approval-request",
        );
        expect(approval).toBeDefined();
        expect(fixture.calls()).toBe(0);
        messages.push(...(await pending.response).messages);
        messages.push({
          role: "tool",
          content: [{ type: "tool-approval-response", approvalId: approval!.approvalId, approved }],
        });
        const model = finishModel();
        const continued = streamText({ model, tools: fixture.tools, messages });
        const continuedParts = await collect(continued.fullStream);
        expect(fixture.calls()).toBe(approved ? 1 : 0);
        if (approved)
          expect(continuedParts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: "tool-result", toolName: "archive_file" }),
            ]),
          );
        else {
          expect(continuedParts).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ type: "tool-output-denied", toolName: "archive_file" }),
            ]),
          );
          expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).toContain("execution-denied");
        }
      }),
  );
it.effect("Full access executes immediately and emits automatic approval metadata", () =>
  Effect.promise(async () => {
    const fixture = setup(true);
    expect(fixture.toolApproval).toEqual({ archive_file: "approved" });
    const result = streamText({
      model: archiveModel(),
      tools: fixture.tools,
      toolApproval: fixture.toolApproval,
      prompt: "Archive it",
    });
    const parts = await collect(result.fullStream);
    expect(fixture.calls()).toBe(1);
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tool-approval-request", isAutomatic: true }),
        expect.objectContaining({ type: "tool-approval-response", approved: true }),
        expect.objectContaining({ type: "tool-result", toolName: "archive_file" }),
      ]),
    );
  }),
);
it("Cloud can never receive Ruth-only tools, including with Full access", () => {
  const services = Context.make(
    Analytics,
    recordingAnalytics(),
  ) as Context.Context<RuthKitServices>;
  const adapter = toAiSdkTools(
    Object.keys(RUTH_TOOL_SPECS) as Array<keyof typeof RUTH_TOOL_SPECS>,
    { ...ctx, agent: "ruth-cloud", fullAccess: true },
    services,
  );
  expect(Object.keys(adapter.tools).sort()).toEqual([
    "find_files",
    "list_files",
    "read_file",
    "search_materials",
  ]);
  expect(adapter.toolApproval).toEqual({});
});

it.effect("additional paired specs inherit agent filtering and execution telemetry", () =>
  Effect.promise(async () => {
    const { registerTool } = await import("./registration.ts");
    const { standardSchema } = await import("./schema.ts");
    const Schema = await import("effect/Schema");
    let calls = 0;
    const extra = {
      sandbox_echo: registerTool({
        spec: {
          name: "sandbox_echo",
          description: "Test sandbox extension",
          inputSchema: standardSchema(Schema.Struct({ value: Schema.String })),
          outputSchema: standardSchema(Schema.Struct({ value: Schema.String })),
        },
        policy: { agents: ["ruth"], approval: "never" },
        execute: (input) =>
          Effect.sync(() => {
            calls++;
            return input;
          }),
      }),
    };
    const services = Context.make(
      Analytics,
      recordingAnalytics(),
    ) as Context.Context<RuthKitServices>;
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          {
            type: "tool-call",
            toolCallId: "extra-call",
            toolName: "sandbox_echo",
            input: '{"value":"hello"}',
          },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
        ]),
      }),
    });
    const adapter = toAiSdkTools(["sandbox_echo"], ctx, services, extra);
    expect(Object.keys(adapter.tools)).toEqual(["sandbox_echo"]);
    await collect(streamText({ model, tools: adapter.tools, prompt: "echo" }).fullStream);
    expect(calls).toBe(1);
    expect(
      Object.keys(
        toAiSdkTools(["sandbox_echo"], { ...ctx, agent: "ruth-cloud" }, services, extra).tools,
      ),
    ).toEqual([]);
  }),
);
