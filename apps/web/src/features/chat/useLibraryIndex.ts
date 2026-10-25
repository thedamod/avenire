"use client";

import type { FileId, Folder, FolderId, LibraryFile } from "@avenire/contracts";
import { useMemo } from "react";
import { useQuery } from "~/lib/rpc";

export interface LibraryIndex {
  readonly folders: readonly Folder[];
  readonly files: readonly LibraryFile[];
  readonly folderById: ReadonlyMap<FolderId, Folder>;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly loading: boolean;
}

/** Active notebooks and files for pickers, mentions and approval labels. */
export function useLibraryIndex(): LibraryIndex {
  const folders = useQuery((client) => client["library.listFolders"](), "chat-folders");
  const files = useQuery((client) => client["library.listFiles"]({}), "chat-files");
  return useMemo(() => {
    const activeFolders = (folders.data ?? [])
      .filter((folder) => folder.archivedAt === null)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const activeFiles = (files.data ?? []).filter((file) => file.placement !== "archived");
    return {
      folders: activeFolders,
      files: activeFiles,
      folderById: new Map((folders.data ?? []).map((folder) => [folder.id, folder] as const)),
      fileById: new Map((files.data ?? []).map((file) => [file.id, file] as const)),
      loading: folders.loading || files.loading,
    };
  }, [folders.data, files.data, folders.loading, files.loading]);
}
