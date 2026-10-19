import { describe, expect, it } from "@effect/vitest";
import { readdir, readFile } from "node:fs/promises";
import { generateText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { canonicalSkillId } from "./skill-ids.ts";
import { loadSkillTool } from "./skills.ts";

it("keeps upstream naming confined to README attribution across owned sources", async () => {
  const root = new URL("../../../../", import.meta.url);
  const readme = await readFile(new URL("README.md", root), "utf8");
  const upstreamName = /https:\/\/github\.com\/wheresryan22\/([a-z-]+)/.exec(readme)![1]!;
  async function inspectSources(dir: URL): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ["node_modules", "dist"].includes(entry.name)) continue;
      expect(entry.name.toLowerCase()).not.toContain(upstreamName);
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) await inspectSources(path);
      else if (
        entry.isFile() &&
        entry.name !== "README.md" &&
        (/\.(?:md|ts|tsx|mjs|css|json|sh)$/.test(entry.name) || entry.name === "figure-chromium")
      )
        expect((await readFile(path, "utf8")).toLowerCase()).not.toContain(upstreamName);
    }
  }
  await inspectSources(new URL("packages/", root));
  await inspectSources(new URL("apps/", root));
});
describe("historical visual IDs", () => {
  it("maps old guides/examples and rejects unknown or prototype IDs", () => {
    for (const id of ["simulation", "explainer"]) expect(canonicalSkillId(id)).toBe("explainer");
    expect(canonicalSkillId("sim-double-pendulum")).toBe("explainer-double-pendulum");
    expect(canonicalSkillId("__proto__")).toBeUndefined();
    expect(canonicalSkillId("missing")).toBeUndefined();
  });
  it("loads one combined body for a persisted request containing both old IDs", async () => {
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolName: "load_skill",
              toolCallId: "load",
              input: JSON.stringify({ skills: ["explainer", "simulation"] }),
            },
          ],
          usage,
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          warnings: [],
        },
      ],
    });
    const result = await generateText({
      model,
      prompt: "Load",
      tools: { load_skill: loadSkillTool() },
    });
    expect(result.toolResults[0]?.output).toMatchObject({ skills: ["explainer"] });
    const content = (result.toolResults[0]?.output as { content: string }).content;
    expect(content.match(/# Interactive explainer\n/g)).toHaveLength(1);
  });
});
