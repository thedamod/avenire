/**
 * Finder semantics, usable for any identifier type (files, folders, threads, trash refs).
 * Pass selection.ids and the targeted ID. Returns a snapshot of the whole selection when
 * it contains id, otherwise [id]. Never mutates selection or calls its setters.
 */
export function contextTargets<T>(selection: ReadonlySet<T>, id: T): readonly T[] {
  return selection.has(id) ? [...selection] : [id];
}
