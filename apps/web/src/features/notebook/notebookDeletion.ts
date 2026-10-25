import type { FolderId, LibraryFile } from "@avenire/contracts";

/** Mirrors the server sweep: archived memberships do not keep a file active. */
export function notebookTrashFiles<T extends Pick<LibraryFile, "folderIds" | "placement" | "kind">>(
  files: readonly T[],
  folderId: FolderId,
  activeFolderIds: ReadonlySet<FolderId>,
): T[] {
  return files.filter(
    (file) =>
      file.placement !== "archived" &&
      file.folderIds.includes(folderId) &&
      !file.folderIds.some((id) => id !== folderId && activeFolderIds.has(id)),
  );
}
export function notebookDeleteCopy(notes: number, sources: number): string {
  const count = `${notes} ${notes === 1 ? "note" : "notes"} and ${sources} ${sources === 1 ? "source" : "sources"}`;
  return `${count} move to Trash with it. Files also in other active notebooks stay in your library. Restoring this notebook also restores the files moved with it. You can restore them from Trash for 30 days.`;
}
