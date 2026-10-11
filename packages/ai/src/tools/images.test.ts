import { expect, it } from "@effect/vitest";
import { streamText, stepCountIs, tool, jsonSchema, type ModelMessage } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import * as Effect from "effect/Effect";
import { createImageTransport, pngImage, imageModelOutput, pruneModelImages } from "./images.ts";
const screenshot = pngImage(new Uint8Array([137, 80, 78, 71]), {
  id: "shot-1",
  width: 480,
  height: 320,
});
const result = { width: 480, contentHeight: 320, consoleMessages: [], screenshot };
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
for (const toolResultImages of [true, false])
  it.effect(
    `mock language model receives images via ${toolResultImages ? "tool content" : "following user message"}`,
    () =>
      Effect.promise(async () => {
        const transport = createImageTransport({ vision: true, toolResultImages }, 2);
        let step = 0;
        const model = new MockLanguageModelV4({
          doStream: async () => ({
            stream:
              step++ === 0
                ? convertArrayToReadableStream([
                    { type: "stream-start", warnings: [] },
                    { type: "tool-call", toolCallId: "call", toolName: "preview", input: "{}" },
                    {
                      type: "finish",
                      finishReason: { unified: "tool-calls", raw: "tool-calls" },
                      usage,
                    },
                  ])
                : convertArrayToReadableStream([
                    { type: "stream-start", warnings: [] },
                    { type: "text-start", id: "text" },
                    { type: "text-delta", id: "text", delta: "Inspected." },
                    { type: "text-end", id: "text" },
                    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
                  ]),
          }),
        });
        const tools = {
          preview: tool({
            inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
            execute: () => {
              transport.attach(result);
              return result;
            },
            toModelOutput: transport.toModelOutput,
          }),
        };
        const streamed = streamText({
          model,
          tools,
          messages: [{ role: "user", content: "Preview" }],
          stopWhen: stepCountIs(2),
          prepareStep: ({ messages }) => ({ messages: transport.prepareMessages(messages) }),
        });
        await streamed.consumeStream();
        expect(await streamed.text).toBe("Inspected.");
        const prompt = model.doStreamCalls[1]!.prompt;
        const toolMessage = prompt.find((message) => message.role === "tool");
        const output = toolMessage?.content[0];
        if (toolResultImages) {
          expect(output).toMatchObject({
            type: "tool-result",
            output: {
              type: "content",
              value: [
                { type: "text" },
                { type: "file", mediaType: "image/png", data: { type: "data" } },
              ],
            },
          });
        } else {
          expect(output).toMatchObject({
            type: "tool-result",
            output: {
              type: "text",
              value: expect.stringContaining("Screenshot attached in the next message"),
            },
          });
          expect(prompt.at(-1)).toMatchObject({
            role: "user",
            content: [{ type: "text" }, { type: "file", mediaType: "image/png" }],
          });
        }
      }),
  );
it("text-only models receive diagnostics without image payloads", () => {
  const transport = createImageTransport({ vision: false, toolResultImages: true });
  transport.attach(result);
  expect(imageModelOutput(result, { vision: false, toolResultImages: true })).toMatchObject({
    type: "text",
    value: expect.stringContaining("cannot inspect images"),
  });
  expect(transport.prepareMessages([])).toEqual([]);
});
it("prunes across tool results and user images while retaining every text and PDF part", () => {
  const messages: ModelMessage[] = [
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "first",
          toolName: "preview",
          output: imageModelOutput(result, { vision: true, toolResultImages: true }),
        },
      ],
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Keep me" },
        { type: "image", image: screenshot.data },
        { type: "file", data: { type: "data", data: "cGRm" }, mediaType: "application/pdf" },
      ],
    },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "last",
          toolName: "preview",
          output: imageModelOutput(
            { ...result, screenshot: { ...screenshot, id: "last" } },
            { vision: true, toolResultImages: true },
          ),
        },
      ],
    },
  ];
  const pruned = pruneModelImages(messages, 1);
  expect(pruned[0]).toMatchObject({ content: [{ output: { value: [{ type: "text" }] } }] });
  expect(pruned[1]).toMatchObject({
    content: [
      { type: "text", text: "Keep me" },
      { type: "file", mediaType: "application/pdf" },
    ],
  });
  expect(pruned[2]).toMatchObject({
    content: [{ output: { value: [{ type: "text" }, { type: "file" }] } }],
  });
  expect(messages[0]).toMatchObject({
    content: [{ output: { value: [{ type: "text" }, { type: "file" }] } }],
  });
});
it.effect("the mock model sees only the latest N images after prepareStep", () =>
  Effect.promise(async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage },
        ]),
      }),
    });
    const messages: ModelMessage[] = [1, 2, 3].map((i) => ({
      role: "user",
      content: [
        { type: "text", text: `Screenshot ${i}` },
        { type: "image", image: screenshot.data, mediaType: "image/png" },
      ],
    }));
    const response = streamText({
      model,
      messages,
      prepareStep: ({ messages }) => ({ messages: pruneModelImages(messages, 1) }),
    });
    await response.consumeStream();
    const prompt = model.doStreamCalls[0]!.prompt;
    const parts = prompt.flatMap((m) => (m.role === "user" ? m.content : []));
    expect(parts.filter((p) => p.type === "file")).toHaveLength(1);
    expect(parts.filter((p) => p.type === "text")).toHaveLength(3);
  }),
);

it("fallback images are injected once immediately after their tool result and survive subsequent steps", () => {
  const transport = createImageTransport({ vision: true, toolResultImages: false }, 1);
  transport.attach(result);
  const messages: ModelMessage[] = [
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "one",
          toolName: "preview",
          output: transport.toModelOutput({ output: result }),
        },
      ],
    },
    { role: "assistant", content: "Next" },
  ];
  const first = transport.prepareMessages(messages);
  expect(first.map((m) => m.role)).toEqual(["tool", "user", "assistant"]);
  transport.attach(result);
  const second = transport.prepareMessages(first);
  expect(second).toEqual(first);
  const later = { ...result, screenshot: { ...screenshot, id: "shot-2" } };
  transport.attach(later);
  const third = transport.prepareMessages([
    ...second,
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "two",
          toolName: "preview",
          output: transport.toModelOutput({ output: later }),
        },
      ],
    },
  ]);
  expect(third[1]).toMatchObject({ role: "user", content: [{ type: "text" }] });
  expect(third.at(-1)).toMatchObject({
    role: "user",
    content: [{ type: "text" }, { type: "file" }],
  });
});
