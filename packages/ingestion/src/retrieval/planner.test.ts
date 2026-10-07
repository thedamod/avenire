import { describe, expect, it } from "@effect/vitest";

import { cleanAspects, splitTestAspects } from "./planner.ts";

describe("query planning", () => {
  it("splits only when both sides are substantive", () => {
    expect(splitTestAspects("How does heat move and why does entropy rise?")).toEqual([
      "How does heat move",
      "why does entropy rise?",
    ]);
    expect(splitTestAspects("heat and entropy")).toEqual([]);
  });

  it("deduplicates, removes the original and caps four aspects", () => {
    expect(
      cleanAspects("Original?", [
        " Original? ",
        "One?",
        "one?",
        "Two?",
        "Three?",
        "Four?",
        "Five?",
      ]),
    ).toEqual(["One?", "Two?", "Three?", "Four?"]);
  });
});
