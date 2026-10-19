import type { SearchLane } from "@avenire/contracts";

// Untuned weights; fit these on the retrieval benchmark.
export const LANE_WEIGHTS = {
  semantic: 1.0,
  lexical: 1.0,
  exact: 1.5,
  location: 2.0,
  graph: 0.8,
  aspect: 0.6,
} as const;

export interface Ranked {
  readonly id: string;
  readonly score: number;
  readonly lanes: ReadonlyArray<SearchLane>;
}

export const weightedRrf = (
  lists: ReadonlyArray<{
    readonly lane: SearchLane;
    readonly weight: number;
    readonly ids: ReadonlyArray<string>;
  }>,
  k = 60,
): ReadonlyArray<Ranked> => {
  const scores = new Map<string, { score: number; lanes: Set<SearchLane> }>();
  for (const list of lists) {
    const seen = new Set<string>();
    list.ids.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      const entry = scores.get(id) ?? { score: 0, lanes: new Set<SearchLane>() };
      entry.score += list.weight / (k + index + 1);
      entry.lanes.add(list.lane);
      scores.set(id, entry);
    });
  }
  return [...scores]
    .map(([id, value]) => ({ id, score: value.score, lanes: [...value.lanes] }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
};

/**
 * Keeps ranked entries in order, at most `maxPerFile` slots per file, until `limit`.
 * An entry that `sharesSlot` with one already kept from its file doesn't take a new
 * slot. Entries whose file can't be resolved are skipped.
 */
export const capPerFile = <T extends { readonly id: string }>(
  ranked: ReadonlyArray<T>,
  fileOf: (id: string) => string | undefined,
  limit: number,
  maxPerFile = 2,
  sharesSlot: (a: T, b: T) => boolean = () => false,
): ReadonlyArray<T> => {
  const keptByFile = new Map<string, Array<T>>();
  const slots = new Map<string, number>();
  const kept: Array<T> = [];
  for (const entry of ranked) {
    if (kept.length >= limit) break;
    const fileId = fileOf(entry.id);
    if (fileId === undefined) continue;
    const siblings = keptByFile.get(fileId) ?? [];
    const free = siblings.some((sibling) => sharesSlot(sibling, entry));
    const used = slots.get(fileId) ?? 0;
    if (!free && used >= maxPerFile) continue;
    if (!free) slots.set(fileId, used + 1);
    keptByFile.set(fileId, [...siblings, entry]);
    kept.push(entry);
  }
  return kept;
};
