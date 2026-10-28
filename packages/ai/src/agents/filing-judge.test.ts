import { FolderId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";
import { MockLanguageModelV4 } from "ai/test";
import * as Effect from "effect/Effect";

import { judgeFiling } from "./filing-judge.ts";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const answering = (text: string) => {
  const prompts: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(options.prompt);
      return {
        content: [{ type: "text" as const, text }],
        usage,
        finishReason: { unified: "stop" as const, raw: "stop" },
        warnings: [],
      };
    },
  });
  return { model, prompts };
};
const input = {
  title: "Lecture 4 slides",
  kind: "pdf",
  excerpt: "Enthalpy and Hess's law",
  candidates: [
    {
      folderId: FolderId.make("chem"),
      name: "Chemistry",
      samples: ["Lecture 3"],
      excerpt: "Thermochemistry",
      similarity: 0.6,
    },
    {
      folderId: FolderId.make("math"),
      name: "Calculus",
      samples: [],
      excerpt: "",
      similarity: null,
    },
  ],
};

describe("judgeFiling", () => {
  it.effect("maps the chosen key back to its notebook and hides ids from the model", () =>
    Effect.gen(function* () {
      const { model, prompts } = answering('{"choice": "n1", "newNotebook": null}');
      expect(yield* judgeFiling(model, input)).toEqual({
        folderId: "chem",
        newNotebook: null,
      });
      expect(JSON.stringify(prompts)).not.toContain('"chem"');
    }),
  );

  it.effect("returns a cleaned new notebook name when nothing fits", () =>
    Effect.gen(function* () {
      const { model } = answering(
        'Sure: {"choice": null, "newNotebook": "  Organic   Chemistry "}',
      );
      expect(yield* judgeFiling(model, input)).toEqual({
        folderId: null,
        newNotebook: "Organic Chemistry",
      });
    }),
  );

  it.effect("treats unknown keys and broken JSON as no verdict", () =>
    Effect.gen(function* () {
      expect(yield* judgeFiling(answering('{"choice": "n9"}').model, input)).toBeNull();
      expect(yield* judgeFiling(answering("no idea").model, input)).toBeNull();
      expect(
        yield* judgeFiling(answering('{"choice": null, "newNotebook": null}').model, input),
      ).toEqual({ folderId: null, newNotebook: null });
    }),
  );
});
