export type Relevance = string | { readonly documentId: string; readonly grade?: number };
export type MetricQuery = { readonly relevant: ReadonlyArray<Relevance> };
export type MetricValues = {
  readonly recall: number;
  readonly precision: number;
  readonly mrr: number;
  readonly ndcg: number;
};

const relevanceMap = (relevant: ReadonlyArray<Relevance>): Map<string, number> => {
  const result = new Map<string, number>();
  for (const entry of relevant) {
    const id = typeof entry === "string" ? entry : entry.documentId;
    const grade = typeof entry === "string" ? 1 : (entry.grade ?? 1);
    result.set(id, Math.max(result.get(id) ?? 0, grade));
  }
  return result;
};

export const recallAtK = (
  ranked: ReadonlyArray<string>,
  relevant: ReadonlyArray<Relevance>,
  k: number,
): number => {
  const truth = relevanceMap(relevant);
  if (!truth.size) return 0;
  return (
    [...new Set(ranked.slice(0, Math.max(0, k)))].filter((id) => truth.has(id)).length / truth.size
  );
};

export const precisionAtK = (
  ranked: ReadonlyArray<string>,
  relevant: ReadonlyArray<Relevance>,
  k: number,
): number => {
  const cutoff = Math.max(0, k);
  if (!cutoff) return 0;
  const truth = relevanceMap(relevant);
  return [...new Set(ranked.slice(0, cutoff))].filter((id) => truth.has(id)).length / cutoff;
};

export const meanReciprocalRank = (
  ranked: ReadonlyArray<string>,
  relevant: ReadonlyArray<Relevance>,
): number => {
  const truth = relevanceMap(relevant);
  const rank = ranked.findIndex((id) => truth.has(id));
  return rank < 0 ? 0 : 1 / (rank + 1);
};

export const ndcgAtK = (
  ranked: ReadonlyArray<string>,
  relevant: ReadonlyArray<Relevance>,
  k: number,
): number => {
  const truth = relevanceMap(relevant);
  const gain = (grade: number) => 2 ** grade - 1;
  const dcg = ranked
    .slice(0, Math.max(0, k))
    .reduce((sum, id, index) => sum + gain(truth.get(id) ?? 0) / Math.log2(index + 2), 0);
  const ideal = [...truth.values()]
    .sort((a, b) => b - a)
    .slice(0, Math.max(0, k))
    .reduce((sum, grade, index) => sum + gain(grade) / Math.log2(index + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
};

export const scoreQuery = (
  ranked: ReadonlyArray<string>,
  relevant: ReadonlyArray<Relevance>,
  k = 10,
): MetricValues => ({
  recall: recallAtK(ranked, relevant, k),
  precision: precisionAtK(ranked, relevant, k),
  mrr: meanReciprocalRank(ranked, relevant),
  ndcg: ndcgAtK(ranked, relevant, k),
});

export const averageMetrics = (values: ReadonlyArray<MetricValues>): MetricValues => {
  if (!values.length) return { recall: 0, precision: 0, mrr: 0, ndcg: 0 };
  return {
    recall: values.reduce((sum, value) => sum + value.recall, 0) / values.length,
    precision: values.reduce((sum, value) => sum + value.precision, 0) / values.length,
    mrr: values.reduce((sum, value) => sum + value.mrr, 0) / values.length,
    ndcg: values.reduce((sum, value) => sum + value.ndcg, 0) / values.length,
  };
};

export const aggregateBy = <A extends string>(
  rows: ReadonlyArray<{ readonly group: A; readonly metrics: MetricValues }>,
): ReadonlyArray<{ readonly group: A; readonly count: number; readonly metrics: MetricValues }> => {
  const groups = new Map<A, Array<MetricValues>>();
  for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row.metrics]);
  return [...groups].map(([group, metrics]) => ({
    group,
    count: metrics.length,
    metrics: averageMetrics(metrics),
  }));
};
