import { expect, it } from "@effect/vitest";
import { modelCapabilities, RUTH_MODEL_DEFAULTS, screenProfileForModel } from "./index.ts";
it("keeps the current Claude models using exact OpenRouter ids", () => {
  expect(RUTH_MODEL_DEFAULTS).toEqual({
    "ruth-sprint": "anthropic/claude-haiku-4.5",
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
