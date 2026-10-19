/** Facts returned with a graph search. */
const MAX_FACTS = 12;

export interface GraphSeed {
  readonly id: string;
  readonly score: number;
}

export interface GraphEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly predicate: string;
  readonly weight: number;
  readonly chunkId: string;
  readonly fileId: string;
}

export interface GraphMention {
  readonly entityId: string;
  readonly chunkId: string;
}

/** Scores new endpoints from one graph hop and keeps the 20 strongest as the frontier. */
export const advanceFrontier = (
  scores: ReadonlyMap<string, number>,
  frontier: ReadonlyArray<string>,
  edges: ReadonlyArray<GraphEdge>,
): { readonly scores: ReadonlyMap<string, number>; readonly frontier: ReadonlyArray<string> } => {
  const next = new Map<string, number>();
  const current = new Set(frontier);
  for (const edge of edges) {
    for (const { known, reached } of [
      { known: edge.sourceId, reached: edge.targetId },
      { known: edge.targetId, reached: edge.sourceId },
    ]) {
      if (!current.has(known) || scores.has(reached)) continue;
      const candidate = (scores.get(known) ?? 0) * edge.weight * 0.5;
      next.set(reached, Math.max(next.get(reached) ?? 0, candidate));
    }
  }
  const strongest = [...next].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20);
  return {
    scores: new Map([...scores, ...strongest]),
    frontier: strongest.map(([id]) => id),
  };
};

/** The strongest score per seed entity, best first, at most `limit`. */
export const mergeSeeds = (
  seeds: ReadonlyArray<GraphSeed>,
  limit: number,
): ReadonlyArray<GraphSeed> =>
  Array.from(Map.groupBy(seeds, (seed) => seed.id).values(), (group) =>
    group.reduce((best, seed) => (seed.score > best.score ? seed : best)),
  )
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);

/**
 * Scores chunks from final entity scores: each walked edge credits its evidence
 * chunk with both endpoints' scores, and each mention credits half its entity's.
 * A chunk stating a relation between two linked entities (a multi-hop bridge)
 * collects the most.
 */
export const rankGraph = (
  scores: ReadonlyMap<string, number>,
  walked: ReadonlyArray<GraphEdge>,
  mentions: ReadonlyArray<GraphMention>,
  limit: number,
) => {
  const chunkScores = new Map<string, number>();
  const add = (id: string, value: number) =>
    chunkScores.set(id, (chunkScores.get(id) ?? 0) + value);
  const edges = [...new Map(walked.map((edge) => [edge.id, edge])).values()].map((edge) => ({
    edge,
    score: ((scores.get(edge.sourceId) ?? 0) + (scores.get(edge.targetId) ?? 0)) * edge.weight,
  }));
  for (const { edge, score } of edges) add(edge.chunkId, score);
  for (const mention of mentions) add(mention.chunkId, (scores.get(mention.entityId) ?? 0) * 0.5);
  const best = <T>(entries: ReadonlyArray<readonly [T, number, string]>, count: number) =>
    entries
      .filter(([, score]) => score > 0)
      .toSorted((a, b) => b[1] - a[1] || a[2].localeCompare(b[2]))
      .slice(0, count)
      .map(([value]) => value);
  return {
    chunkIds: best(
      [...chunkScores].map(([id, score]) => [id, score, id] as const),
      limit,
    ),
    facts: best(
      edges.map(({ edge, score }) => [edge, score, edge.id] as const),
      MAX_FACTS,
    ),
  };
};
