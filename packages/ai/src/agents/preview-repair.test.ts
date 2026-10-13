import { generateText, jsonSchema, streamText, tool, type ToolSet } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "@effect/vitest";
import { RuthModels } from "../models/index.ts";
import { pngImage } from "../tools/images.ts";
import { createAgent } from "./factory.ts";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const schema = jsonSchema<Record<string, never>>({
  type: "object",
  properties: {},
  additionalProperties: false,
});
function fixture(
  mode: "generate" | "stream",
  failure: "uncaught" | "transport" | "warning",
  script: Array<string | null>,
) {
  let next = 0,
    previews = 0,
    rendered = 0;
  const tools: ToolSet = {
    box_exec: tool({ inputSchema: schema, execute: () => ({ exitCode: 0, output: "fixed" }) }),
    preview_widget: tool({
      inputSchema: schema,
      execute: () => {
        previews++;
        if (previews === 1 && failure === "transport") throw new Error("Preview connection reset");
        return {
          consoleMessages: previews === 1 ? [{ level: failure, text: "Preview feedback" }] : [],
          screenshot: pngImage(new Uint8Array([137, 80, 78, 71]), {
            id: `preview-${previews}`,
            width: 640,
            height: 480,
          }),
        };
      },
    }),
    render_widget: tool({
      inputSchema: schema,
      execute: () => {
        rendered++;
        return { assetId: "widget", url: "https://widgets.example.test/widget" };
      },
    }),
  };
  const phase = () => ({ name: script[next++] ?? null, id: `call-${next}` });
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const p = phase();
      return {
        content: p.name
          ? [{ type: "tool-call" as const, toolName: p.name, toolCallId: p.id, input: "{}" }]
          : [{ type: "text" as const, text: "Delivered." }],
        usage,
        finishReason: {
          unified: p.name ? ("tool-calls" as const) : ("stop" as const),
          raw: p.name ? "tool_calls" : "stop",
        },
        warnings: [],
      };
    },
    doStream: async () => {
      const p = phase();
      const finish = {
        type: "finish" as const,
        usage,
        finishReason: {
          unified: p.name ? ("tool-calls" as const) : ("stop" as const),
          raw: p.name ? "tool_calls" : "stop",
        },
      };
      const stream = p.name
        ? convertArrayToReadableStream([
            { type: "tool-call" as const, toolName: p.name, toolCallId: p.id, input: "{}" },
            finish,
          ])
        : convertArrayToReadableStream([
            { type: "text-start" as const, id: "answer" },
            { type: "text-delta" as const, id: "answer", delta: "Delivered." },
            { type: "text-end" as const, id: "answer" },
            finish,
          ]);
      return { stream };
    },
  });
  const agent = createAgent({
    kind: "ruth",
    models: RuthModels.of({
      languageModel: () => model,
      capabilities: () => ({ vision: true, toolResultImages: true }),
      maxImages: 2,
    }),
    bindTools: (images) => ({
      tools: {
        ...tools,
        preview_widget: { ...tools.preview_widget!, toModelOutput: images.toModelOutput },
      },
      toolApproval: {},
    }),
  });
  const run = async () => {
    if (mode === "generate") return generateText({ ...agent, prompt: "Explain interactively" });
    const result = streamText({ ...agent, prompt: "Explain interactively" });
    return { text: await result.text, steps: await result.steps };
  };
  return { model, run, rendered: () => rendered, previews: () => previews };
}

describe("same-thread preview feedback", () => {
  for (const mode of ["generate", "stream"] as const) {
    it(`${mode} completes a long sandbox workflow, repairs, previews and delivers with the same tools`, async () => {
      const f = fixture(mode, "uncaught", [
        ...Array<string>(30).fill("box_exec"),
        "preview_widget",
        "box_exec",
        "preview_widget",
        "render_widget",
        null,
      ]);
      const result = await f.run();
      expect(result.steps).toHaveLength(35);
      expect(result.text).toBe("Delivered.");
      expect(f.previews()).toBe(2);
      expect(f.rendered()).toBe(1);
      const calls = mode === "generate" ? f.model.doGenerateCalls : f.model.doStreamCalls;
      expect(calls[31]?.tools?.map((t) => t.name)).not.toContain("render_widget");
      expect(calls[31]?.toolChoice?.type).not.toBe("required");
      const feedback = calls[31]?.prompt.findLast((message) => message.role === "tool");
      expect(feedback).toMatchObject({
        content: [
          {
            type: "tool-result",
            toolName: "preview_widget",
            output: {
              type: "content",
              value: [
                { type: "text", text: expect.stringContaining('"level":"uncaught"') },
                { type: "file", mediaType: "image/png", data: { type: "data" } },
              ],
            },
          },
        ],
      });
      expect(calls[33]?.tools?.map((t) => t.name)).toContain("render_widget");
    });
  }
  it("finishes naturally after warnings and repairs preview transport errors", async () => {
    const warning = fixture("generate", "warning", ["preview_widget", null]);
    expect((await warning.run()).steps).toHaveLength(2);
    const error = fixture("generate", "transport", [
      "preview_widget",
      "box_exec",
      "preview_widget",
      "render_widget",
      null,
    ]);
    expect((await error.run()).text).toBe("Delivered.");
    expect(error.rendered()).toBe(1);
  });
});
