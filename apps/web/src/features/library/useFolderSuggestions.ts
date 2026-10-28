"use client";

import { useMemo } from "react";
import type { FileId, Folder, FolderId } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import { useQuery } from "~/lib/rpc";

export interface FilingSuggestion {
  /** Live notebooks, best first. */
  readonly suggested: readonly Folder[];
  /** When no notebook fits: a name for a new one. */
  readonly newNotebook: string | null;
}

const NONE: ReadonlyMap<FileId, FilingSuggestion> = new Map();

/**
 * Where each file most likely belongs: notebooks best first, or a new notebook's name.
 * One request per distinct set of files; the server caps a batch at 200.
 */
export function useFolderSuggestions(
  fileIds: readonly FileId[],
  folderById: ReadonlyMap<FolderId, Folder>,
): ReadonlyMap<FileId, FilingSuggestion> {
  const ids = useMemo(() => [...new Set(fileIds)].toSorted().slice(0, 200), [fileIds]);
  const query = useQuery(
    (client) =>
      ids.length ? client["library.suggestFolders"]({ fileIds: ids }) : Effect.succeed([]),
    // "files" in the key subscribes to file invalidation, so indexing refreshes suggestions.
    `library-files-suggestions:${ids.join(",")}`,
  );
  return useMemo(() => {
    if (!query.data?.length) return NONE;
    return new Map(
      query.data.map((row) => [
        row.fileId,
        {
          suggested: row.suggestions
            .map((suggestion) => folderById.get(suggestion.folderId))
            .filter(
              (folder): folder is Folder => folder !== undefined && folder.archivedAt === null,
            ),
          newNotebook: row.newNotebook,
        },
      ]),
    );
  }, [query.data, folderById]);
}
