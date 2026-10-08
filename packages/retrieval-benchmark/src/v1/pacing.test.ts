import { describe, expect, it } from "@effect/vitest";

import { rerankCalls } from "./run.ts";

const result = (overrides: { cached?: boolean; aspects?: number }) => ({
  hits: [],
  facts: [],
  aspects: Array.from({ length: overrides.aspects ?? 0 }, () => ({ text: "q", covered: true })),
  reranked: true,
  abstained: false,
  cached: overrides.cached ?? false,
});

describe("rerank call counting", () => {
  it("counts one call for standard and one per aspect on top for deep", () => {
    expect(rerankCalls("standard", result({ aspects: 2 }))).toBe(1);
    expect(rerankCalls("deep", result({ aspects: 2 }))).toBe(3);
    expect(rerankCalls("deep", result({}))).toBe(1);
  });

  it("counts none for a cached search", () => {
    expect(rerankCalls("standard", result({ cached: true }))).toBe(0);
    expect(rerankCalls("deep", result({ cached: true, aspects: 2 }))).toBe(0);
  });
});
