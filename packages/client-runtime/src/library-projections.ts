import type { FileId, IngestionJob } from "@avenire/contracts";

export type LibraryProjection = "files" | "folders" | "canvas";
const subscriptions = new WeakMap<
  object,
  Set<{ projection: LibraryProjection; refresh: () => void }>
>();

export function libraryProjection(queryKey: string): LibraryProjection | undefined {
  if (queryKey === "canvas-nodes") return "canvas";
  if (queryKey.includes("folders") || queryKey === "folders-list") return "folders";
  if (queryKey.includes("files")) return "files";
  return undefined;
}

export function subscribeLibraryProjection(
  runtime: object,
  queryKey: string,
  refresh: () => void,
): () => void {
  const projection = libraryProjection(queryKey);
  if (!projection) return () => {};
  let entries = subscriptions.get(runtime);
  if (!entries) subscriptions.set(runtime, (entries = new Set()));
  const entry = { projection, refresh };
  entries.add(entry);
  return () => {
    entries.delete(entry);
  };
}

export function invalidateLibrary(
  runtime: object,
  projections: readonly LibraryProjection[] = ["files", "folders"],
): void {
  for (const entry of subscriptions.get(runtime) ?? []) {
    if (projections.includes(entry.projection)) entry.refresh();
  }
}

/** One latest job per file. Replay of an older attempt cannot roll its status back. */
export function updateLatestJob(
  previous: ReadonlyMap<FileId, IngestionJob>,
  job: IngestionJob,
  visibleFiles?: ReadonlySet<FileId>,
): ReadonlyMap<FileId, IngestionJob> {
  if (visibleFiles && !visibleFiles.has(job.fileId)) return previous;
  const current = previous.get(job.fileId);
  if (
    current &&
    (current.createdAt > job.createdAt ||
      (current.createdAt === job.createdAt && current.updatedAt > job.updatedAt))
  )
    return previous;
  return new Map(previous).set(job.fileId, job);
}

export function pruneJobs(
  previous: ReadonlyMap<FileId, IngestionJob>,
  visibleFiles: ReadonlySet<FileId>,
): ReadonlyMap<FileId, IngestionJob> {
  if ([...previous.keys()].every((id) => visibleFiles.has(id))) return previous;
  return new Map([...previous].filter(([id]) => visibleFiles.has(id)));
}
