import { describe, expect, it } from "@effect/vitest";

import { calibrate, type CalibrationQuery } from "./calibrate.ts";

const query = (
  id: string,
  family: string,
  topRelevance: number | null,
  split: CalibrationQuery["split"] = "development",
): CalibrationQuery => ({ id, family, topRelevance, split, abstained: false });

describe("abstention calibration", () => {
  it("maximizes development F1 under the answerable false-abstention cap", () => {
    const input = [
      query("a1", "direct-fact", 0.4),
      query("a2", "direct-fact", 0.7),
      query("n1", "unanswerable", 0.1),
      query("n2", "unanswerable", 0.5),
      query("test-a", "direct-fact", 0.01, "test"),
      query("test-n", "unanswerable", 0.9, "test"),
    ];
    const result = calibrate(input);
    expect(result.answerableCount).toBe(2);
    expect(result.unanswerableCount).toBe(2);
    expect(result.chosen.trueAbstentions).toBe(1);
    expect(result.chosen.falseAbstentions).toBe(0);
    expect(result.chosen.f1).toBeCloseTo(2 / 3);
    expect(result.rows.some((row) => row.trueAbstentions === 2 && !row.eligible)).toBe(true);
  });

  it("treats an equal relevance as an answer and keeps unscored outcomes fixed", () => {
    const input: ReadonlyArray<CalibrationQuery> = [
      query("a", "direct-fact", 0.5),
      query("n", "unanswerable", 0.5),
      { ...query("empty", "unanswerable", null), abstained: true },
      { ...query("failed", "direct-fact", 0.01), error: "provider unavailable" },
    ];
    const result = calibrate(input);
    expect(result.excludedFailures).toBe(1);
    expect(result.rows[0]?.trueAbstentions).toBe(1);
    expect(result.rows[0]?.falseAbstentions).toBe(0);
    expect(result.chosen.falseAbstentions).toBe(0);
  });

  it("rejects an unscored development set", () => {
    expect(() =>
      calibrate([query("a", "direct-fact", null), query("n", "unanswerable", null)]),
    ).toThrow(/requires reranker relevance scores/);
  });
});
