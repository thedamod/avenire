import { useRef, useState } from "react";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import type { FileId, FolderId, FolderColor, FolderCover } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { useApi } from "../../state/api";

export function useNotebook(folderId: FolderId) {
  const folder = useQuery(
    (client) => client["library.getFolder"]({ folderId }),
    `notebook-folders-${folderId}`,
  );
  const files = useQuery(
    (client) => client["library.listFiles"]({ folderId }),
    `notebook-files-${folderId}`,
  );
  const active = files.data?.filter((file) => file.placement !== "archived");
  return {
    folder: folder.data,
    notes: active
      ?.filter((file) => file.kind === "note")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    sources: active
      ?.filter((file) => file.kind !== "note")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    loading: folder.loading || files.loading,
    error: folder.error ?? files.error,
    refetch: () => {
      void folder.refetch();
      void files.refetch();
    },
  };
}

export function useNotebookActions() {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<unknown>();
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (pending.current) return undefined;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      return await action();
    } catch (cause) {
      setError(cause);
      return undefined;
    } finally {
      pending.current = false;
      setBusy(false);
      invalidateLibrary(api);
    }
  }
  return {
    busy,
    error,
    create: (input: { name: string; color: FolderColor; cover: FolderCover }) =>
      run(() => call(api, (client) => client["library.createFolder"](input))),
    update: (
      folderId: FolderId,
      patch: { name?: string; color?: FolderColor; cover?: FolderCover },
    ) => run(() => call(api, (client) => client["library.updateFolder"]({ folderId, ...patch }))),
    trash: (folderId: FolderId) =>
      run(async () => {
        await call(api, (client) => client["library.trashFolder"]({ folderId }));
        return true;
      }),
    createNote: (folderIds: FolderId[]) =>
      run(() =>
        call(api, (client) =>
          client["library.createNote"]({
            title: "Untitled",
            markdown: "",
            folderIds,
            source: "user",
          }),
        ),
      ),
    trashNote: (fileId: FileId) =>
      run(async () => {
        await call(api, (client) => client["library.trashFiles"]({ fileIds: [fileId] }));
        return true;
      }),
  };
}

export function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
