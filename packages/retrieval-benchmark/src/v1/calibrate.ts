export interface CalibrationQuery {
  readonly id: string;
  readonly family: string;
  readonly split: "development" | "test";
  readonly topRelevance: number | null;
  readonly abstained: boolean;
  readonly error?: string;
}

export interface SweepRow {
  readonly threshold: number;
  readonly trueAbstentions: number;
  readonly falseAbstentions: number;
  readonly falseAbstentionRate: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly eligible: boolean;
}

export interface Calibration {
  readonly answerableCount: number;
  readonly unanswerableCount: number;
  readonly excludedFailures: number;
  readonly rows: ReadonlyArray<SweepRow>;
  readonly chosen: SweepRow;
}

/** Search abstains only when relevance is strictly below the configured threshold. */
const wouldAbstain = (query: CalibrationQuery, threshold: number) =>
  query.topRelevance === null ? query.abstained : query.topRelevance < threshold;

const candidateThresholds = (queries: ReadonlyArray<CalibrationQuery>): ReadonlyArray<number> => {
  const scores = [
    ...new Set(
      queries.flatMap((query) => (query.topRelevance === null ? [] : [query.topRelevance])),
    ),
  ].sort((a, b) => a - b);
  const between = scores.slice(1).map((score, index) => ((scores[index] ?? score) + score) / 2);
  const highest = scores.at(-1);
  return highest === undefined
    ? [0]
    : [0, ...between, highest + Math.max(1, Math.abs(highest)) * Number.EPSILON * 2];
};

/** Fits abstention on development data with at most 5% false abstention. */
export const calibrate = (
  input: ReadonlyArray<CalibrationQuery>,
  maxFalseAbstentionRate = 0.05,
): Calibration => {
  const development = input.filter((query) => query.split === "development");
  const queries = development.filter((query) => query.error === undefined);
  const answerableCount = queries.filter((query) => query.family !== "unanswerable").length;
  const unanswerableCount = queries.length - answerableCount;
  if (answerableCount === 0 || unanswerableCount === 0) {
    throw new Error("Calibration requires answerable and unanswerable development queries");
  }
  if (
    queries.some((query) => query.topRelevance !== null && !Number.isFinite(query.topRelevance))
  ) {
    throw new Error("Calibration relevance scores must be finite");
  }
  if (queries.every((query) => query.topRelevance === null)) {
    throw new Error("Calibration requires reranker relevance scores");
  }
  const rows = candidateThresholds(queries).map((threshold): SweepRow => {
    const trueAbstentions = queries.filter(
      (query) => query.family === "unanswerable" && wouldAbstain(query, threshold),
    ).length;
    const falseAbstentions = queries.filter(
      (query) => query.family !== "unanswerable" && wouldAbstain(query, threshold),
    ).length;
    const precision =
      trueAbstentions + falseAbstentions === 0
        ? 0
        : trueAbstentions / (trueAbstentions + falseAbstentions);
    const recall = trueAbstentions / unanswerableCount;
    const falseAbstentionRate = falseAbstentions / answerableCount;
    return {
      threshold,
      trueAbstentions,
      falseAbstentions,
      falseAbstentionRate,
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      eligible: falseAbstentionRate <= maxFalseAbstentionRate,
    };
  });
  const eligible = rows.filter((row) => row.eligible);
  const chosen = eligible.toSorted(
    (a, b) => b.f1 - a.f1 || a.falseAbstentions - b.falseAbstentions || a.threshold - b.threshold,
  )[0];
  if (chosen === undefined) throw new Error("No eligible abstention threshold");
  return {
    answerableCount,
    unanswerableCount,
    excludedFailures: development.length - queries.length,
    rows,
    chosen,
  };
};
