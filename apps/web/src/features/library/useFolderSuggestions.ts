"use client";

import { useMemo } from "react";
import type { FileId, Folder, FolderId } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { useQuery } from "~/lib/rpc";

const NONE: ReadonlyMap<FileId, readonly Folder[]> = new Map();

/**
 * The notebooks each file most likely belongs in, best first, limited to live notebooks.
 * One request per distinct set of files; the server caps a batch at 200.
 */
export function useFolderSuggestions(
  fileIds: readonly FileId[],
  folderById: ReadonlyMap<FolderId, Folder>,
): ReadonlyMap<FileId, readonly Folder[]> {
  const ids = useMemo(() => [...new Set(fileIds)].toSorted().slice(0, 200), [fileIds]);
  const query = useQuery(
    (client) =>
      ids.length ? client["library.suggestFolders"]({ fileIds: ids }) : Effect.succeed([]),
    `library-suggestions:${ids.join(",")}`,
  );
  return useMemo(() => {
    if (!query.data?.length) return NONE;
    return new Map(
      query.data.map((row) => [
        row.fileId,
        row.suggestions
          .map((suggestion) => folderById.get(suggestion.folderId))
          .filter((folder): folder is Folder => folder !== undefined && folder.archivedAt === null),
      ]),
    );
  }, [query.data, folderById]);
}
