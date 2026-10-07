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
 * Keeps ranked entries in order, at most `maxPerItem` slots per item, until `limit`.
 * An entry that `sharesSlot` with one already kept from its item doesn't take a new
 * slot. Entries whose item can't be resolved are skipped.
 */
export const capPerItem = <T extends { readonly id: string }>(
  ranked: ReadonlyArray<T>,
  itemOf: (id: string) => string | undefined,
  limit: number,
  maxPerItem = 2,
  sharesSlot: (a: T, b: T) => boolean = () => false,
): ReadonlyArray<T> => {
  const keptByItem = new Map<string, Array<T>>();
  const slots = new Map<string, number>();
  const kept: Array<T> = [];
  for (const entry of ranked) {
    if (kept.length >= limit) break;
    const itemId = itemOf(entry.id);
    if (itemId === undefined) continue;
    const siblings = keptByItem.get(itemId) ?? [];
    const free = siblings.some((sibling) => sharesSlot(sibling, entry));
    const used = slots.get(itemId) ?? 0;
    if (!free && used >= maxPerItem) continue;
    if (!free) slots.set(itemId, used + 1);
    keptByItem.set(itemId, [...siblings, entry]);
    kept.push(entry);
  }
  return kept;
};
