import { useRef, useState } from "react";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import type { TrashEntry, TrashRef } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { useApi } from "../../state/api";
import { errorMessage } from "../../ui";

export function entryKey(entry: TrashEntry) {
  return entry._tag === "file" ? `file:${entry.file.id}` : `folder:${entry.folder.id}`;
}
export function entryTitle(entry: TrashEntry) {
  return entry._tag === "file" ? entry.file.title : entry.folder.name;
}
function entryRef(entry: TrashEntry): TrashRef {
  return entry._tag === "file"
    ? { _tag: "file", id: entry.file.id }
    : { _tag: "folder", id: entry.folder.id };
}
export function useTrash() {
  const query = useQuery((client) => client["library.listTrash"](), "library-trash");
  const folders = useQuery((client) => client["library.listFolders"](), "library-folders");
  const api = useApi();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  async function mutate(action: "restore" | "purge" | "empty", entries: readonly TrashEntry[]) {
    if (locked.current || !entries.length) return false;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (action === "empty") await call(api, (client) => client["library.emptyTrash"]());
      else if (action === "restore")
        await call(api, (client) => client["library.restore"]({ refs: entries.map(entryRef) }));
      else await call(api, (client) => client["library.purge"]({ refs: entries.map(entryRef) }));
      const removed = new Set(entries.map(entryKey));
      query.setData((previous) => previous?.filter((entry) => !removed.has(entryKey(entry))));
      setNotice(
        action === "restore"
          ? `${entries.length} ${entries.length === 1 ? "item" : "items"} restored.`
          : action === "empty"
            ? "Trash emptied."
            : `${entries.length} ${entries.length === 1 ? "item" : "items"} deleted forever.`,
      );
      invalidateLibrary(api, ["files", "folders", "notes", "trash"]);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      void query.refetch();
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { ...query, folders, busy, mutationError: error, notice, mutate };
}
