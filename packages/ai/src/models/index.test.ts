import { expect, it } from "@effect/vitest";
import {
  modelCapabilities,
  RUTH_MODEL_DEFAULTS,
  screenProfileForModel,
  parseModelId,
} from "./index.ts";
it("defaults sprint to GLM 5.3 Flash on Fireworks and core/apex to Claude on OpenRouter", () => {
  expect(RUTH_MODEL_DEFAULTS).toEqual({
    "ruth-sprint": "fireworks:accounts/fireworks/models/glm-5p3-flash",
    "ruth-core": "anthropic/claude-sonnet-5.5",
    "ruth-apex": "anthropic/claude-opus-5.5",
  });
});
it("derives vision from architecture and defaults tool images by provider route", () => {
  for (const id of ["anthropic/claude", "openai/gpt", "google/gemini"])
    expect(modelCapabilities(id, ["text", "image"])).toMatchObject({
      vision: true,
      toolResultImages: true,
    });
  expect(modelCapabilities("unknown/model", ["text"])).toMatchObject({
    vision: false,
    toolResultImages: false,
  });
  expect(modelCapabilities("unknown/vision", ["image"])).toMatchObject({
    vision: true,
    toolResultImages: false,
  });
  expect(
    modelCapabilities("anthropic/claude", ["image"], { toolResultImages: false }),
  ).toMatchObject({
    vision: true,
    toolResultImages: false,
  });
});

it("assigns portable profile conventions by model capability family", () => {
  for (const [id, profile] of [
    ["anthropic/claude", "pixels-1280x720"],
    ["openai/computer-use-preview", "pixels-native"],
    ["openai/gpt", "pixels-1280x720"],
    ["google/gemini", "normalized-999"],
    ["qwen/qwen3-vl", "normalized-1000"],
    ["qwen/qwen2.5-vl", "pixels-1280x720"],
    ["unknown/model", "pixels-1280x720"],
  ])
    expect(screenProfileForModel(id!).id).toBe(profile);
});

it("routes fireworks: ids to Fireworks and everything else to OpenRouter", () => {
  expect(parseModelId("fireworks:accounts/fireworks/models/glm-5p3-flash")).toEqual({
    provider: "fireworks",
    id: "accounts/fireworks/models/glm-5p3-flash",
  });
  expect(parseModelId("anthropic/claude-sonnet-5.5")).toEqual({
    provider: "openrouter",
    id: "anthropic/claude-sonnet-5.5",
  });
});
it("gives GLM vision from its catalog, follow-up-message images and the 0-1000 grid", () => {
  const glm = modelCapabilities("fireworks:accounts/fireworks/models/glm-5p3-flash", [
    "text",
    "image",
  ]);
  expect(glm).toMatchObject({ vision: true, toolResultImages: false });
  expect(glm.screenProfile?.id).toBe("normalized-1000");
});
