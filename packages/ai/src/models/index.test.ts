import { expect, it } from "@effect/vitest";
import { modelCapabilities, RUTH_MODEL_DEFAULTS } from "./index.ts";
it("keeps the current Claude models using exact OpenRouter ids", () => {
  expect(RUTH_MODEL_DEFAULTS).toEqual({
    "ruth-sprint": "anthropic/claude-haiku-4.5",
    "ruth-core": "anthropic/claude-sonnet-5.5",
    "ruth-apex": "anthropic/claude-opus-5.5",
  });
});
it("derives vision from architecture and defaults tool images by provider route", () => {
  for (const id of ["anthropic/claude", "openai/gpt", "google/gemini"])
    expect(modelCapabilities(id, ["text", "image"])).toEqual({
      vision: true,
      toolResultImages: true,
    });
  expect(modelCapabilities("unknown/model", ["text"])).toEqual({
    vision: false,
    toolResultImages: false,
  });
  expect(modelCapabilities("unknown/vision", ["image"])).toEqual({
    vision: true,
    toolResultImages: false,
  });
  expect(modelCapabilities("anthropic/claude", ["image"], { toolResultImages: false })).toEqual({
    vision: true,
    toolResultImages: false,
  });
});
