import { createFireworks } from "@ai-sdk/fireworks";
import { generateText } from "ai";
import { describe, expect, it } from "@effect/vitest";
import { RUTH_MODEL_CAPABILITIES, RuthModels } from "../models/index.ts";
import { createAgent } from "./factory.ts";

describe("sprint latency settings", () => {
  it("sends low effort through the real Fireworks adapter only for sprint chat", async () => {
    for (const [kind, name, expected] of [
      ["ruth", "ruth-sprint", "low"],
      ["ruth", "ruth-core", undefined],
      ["ruth-cloud", "ruth-sprint", undefined],
    ] as const) {
      let request: Record<string, unknown> = {};
      const provider = createFireworks({
        apiKey: "test-only",
        fetch: async (_url, init) => {
          request = JSON.parse(String(init?.body));
          return Response.json({
            id: "test",
            created: 0,
            model: "accounts/fireworks/models/glm-5p3-flash",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Ready." },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          });
        },
      });
      const agent = createAgent({
        kind,
        name,

        models: RuthModels.of({
          languageModel: () => provider.chatModel("accounts/fireworks/models/glm-5p3-flash"),
          capabilities: (n) => RUTH_MODEL_CAPABILITIES[n],
          maxImages: 0,
        }),
        bindTools: () => ({ tools: {}, toolApproval: {} }),
      });
      const result = await generateText({ ...agent, prompt: "Hello" });
      expect(result.text).toBe("Ready.");
      expect(request.reasoning_effort).toBe(expected);
    }
  });
});
