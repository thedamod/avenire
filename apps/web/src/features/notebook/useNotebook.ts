"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { Folder, FolderColor, FolderCover, FolderId, LibraryFile } from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { useLibrary } from "~/features/library/LibraryProvider";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";

/** Notes last edited first; sources newest first. */
function byEdited(a: LibraryFile, b: LibraryFile) {
  return b.updatedAt.localeCompare(a.updatedAt);
}
function byCreated(a: LibraryFile, b: LibraryFile) {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * One notebook: the folder, its notes and its sources. The library-wide list (LibraryProvider)
 * carries the optimistic state of moves and trashes made from the selection dock, so a file it
 * no longer has, or no longer files here, disappears at once instead of after the refetch.
 */
export function useNotebook(folderId: FolderId) {
  const api = useApi();
  const library = useLibrary();
  const folder = useQuery(
    (client) => client["library.getFolder"]({ folderId }),
    `notebook-folders-${folderId}`,
  );
  const files = useQuery(
    (client) => client["library.listFiles"]({ folderId }),
    `notebook-files-${folderId}`,
  );

  // Instant first paint from the library list while getFolder is in flight.
  const current: Folder | undefined = folder.data ?? library.folderById.get(folderId);

  const visible = useMemo(() => {
    const cached = files.data ?? library.files?.filter((file) => file.folderIds.includes(folderId));
    if (!cached) return undefined;
    const latest = library.files ? new Map(library.files.map((file) => [file.id, file])) : null;
    return cached.flatMap((file) => {
      if (file.placement === "archived") return [];
      if (!latest) return [file];
      const next = latest.get(file.id);
      if (!next || !next.folderIds.includes(folderId)) return [];
      return [next];
    });
  }, [files.data, library.files, folderId]);

  const notes = useMemo(
    () => visible?.filter((file) => file.kind === "note").toSorted(byEdited),
    [visible],
  );
  const sources = useMemo(
    () => visible?.filter((file) => file.kind !== "note").toSorted(byCreated),
    [visible],
  );

  const setFolder = folder.setData;
  const update = useCallback(
    async (patch: { name?: string; color?: FolderColor; cover?: FolderCover }) => {
      const before = current;
      if (before) setFolder({ ...before, ...patch });
      try {
        const next = await call(api, (client) =>
          client["library.updateFolder"]({ folderId, ...patch }),
        );
        setFolder(next);
      } catch (cause) {
        if (before) setFolder(before);
        toast.error(`Couldn't update the notebook: ${errorMessage(cause)}`);
      } finally {
        invalidateLibrary(api, ["folders"]);
      }
    },
    [api, current, folderId, setFolder],
  );

  const restore = useCallback(async () => {
    try {
      await call(api, (client) =>
        client["library.restore"]({ refs: [{ _tag: "folder" as const, id: folderId }] }),
      );
      invalidateLibrary(api);
    } catch (cause) {
      toast.error(`Couldn't restore: ${errorMessage(cause)}`);
    }
  }, [api, folderId]);

  return {
    folder: current,
    folderError: folder.data || current ? undefined : folder.error,
    filesError: files.data ? undefined : files.error,
    refetchFolder: folder.refetch,
    refetchFiles: files.refetch,
    notes,
    sources,
    update,
    restore,
  };
}
