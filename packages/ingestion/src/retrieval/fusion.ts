/** Rank fusion and result shaping. Pure, so every rule here is unit-tested. */

const RRF_K = 60;
/** Keeps one long item from filling every slot. */
const MAX_CHUNKS_PER_ITEM = 2;

export interface Ranked {
  readonly id: string;
  readonly score: number;
}

/** Fuse ranked id lists: each list contributes 1 / (k + rank) for every id it contains. */
export const reciprocalRankFusion = (
  rankings: ReadonlyArray<ReadonlyArray<string>>,
  k = RRF_K,
): ReadonlyArray<Ranked> => {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores].map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
};

/**
 * Walk ranked ids in order, keeping at most `maxPerItem` per item, until `limit` are kept.
 * `itemOf` returns undefined for ids that can't be resolved; those are skipped.
 */
export const capPerItem = (
  ranked: ReadonlyArray<Ranked>,
  itemOf: (id: string) => string | undefined,
  limit: number,
  maxPerItem = MAX_CHUNKS_PER_ITEM,
): ReadonlyArray<Ranked> => {
  const perItem = new Map<string, number>();
  const kept: Array<Ranked> = [];
  for (const entry of ranked) {
    if (kept.length >= limit) break;
    const itemId = itemOf(entry.id);
    if (itemId === undefined) continue;
    const count = perItem.get(itemId) ?? 0;
    if (count >= maxPerItem) continue;
    perItem.set(itemId, count + 1);
    kept.push(entry);
  }
  return kept;
};
