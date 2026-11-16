import { expect, it } from "vite-plus/test";
import { createAgent } from "./factory.ts";
import type { RuthModels } from "../models/index.ts";
import { describeClientContext } from "../prompts/client-context.ts";
const models = {
  capabilities: () => ({ vision: true, toolResultImages: true }),
  maxImages: 4,
  languageModel: () => ({}),
} as unknown as RuthModels["Service"];
const bindTools = () => ({ tools: {}, toolApproval: {} });
it("passes the current phone platform, viewport and capture size into the actual agent prompt", () => {
  const agent = createAgent({
    kind: "ruth",
    models,
    bindTools,
    page: { platform: "mobile", surface: "ephemeral", contentWidthPx: 360 },
    screen: { width: 720, height: 1600 },
  });
  expect(agent.system).toContain("a mobile phone");
  expect(agent.system).toContain("360 logical pixels");
  expect(agent.system).toContain("720 × 1600 pixels (portrait)");
  expect(agent.system).toContain("Labels may be far from their targets");
  expect(agent.system).toContain("leave clear gaps between their whole text boxes");
});
it("applies the same spacing and arrow rules on desktop without describing it as a phone", () => {
  const text = describeClientContext({
    page: { platform: "desktop", surface: "ephemeral", contentWidthPx: 1200 },
  }).join("\n");
  expect(text).toContain("the desktop client");
  expect(text).toContain("1200 logical pixels");
  expect(text).toContain("Labels may be far from their targets");
  expect(text).toContain("leave clear gaps between their whole text boxes");
  expect(text).not.toContain("a mobile phone");
});
it("does not guess a device for clients without page context", () => {
  expect(describeClientContext({})).toEqual([]);
});
