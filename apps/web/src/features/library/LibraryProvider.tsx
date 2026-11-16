"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  FileId,
  Folder,
  FolderColor,
  FolderCover,
  FolderId,
  LibraryFile,
} from "@avenire/contracts";
import { call, invalidateLibrary } from "@avenire/client-runtime/rpc";
import { errorMessage, useApi, useQuery } from "~/lib/rpc";
import { plural } from "~/components/app";
import { LibraryPrefetch } from "./LibraryPrefetch";

export interface LibraryState {
  readonly folders: readonly Folder[] | undefined;
  /** Active files (notes and sources), newest first. */
  readonly files: readonly LibraryFile[] | undefined;
  readonly folderById: ReadonlyMap<FolderId, Folder>;
  readonly error: unknown;
  readonly refetch: () => void;
  readonly actions: LibraryActions;
}

export interface LibraryActions {
  createNotebook(input: {
    name: string;
    color?: FolderColor;
    cover?: FolderCover;
  }): Promise<Folder>;
  moveFiles(fileIds: readonly FileId[], folder: Folder): Promise<void>;
  renameFile(fileId: FileId, title: string): Promise<void>;
  removeFilesFromNotebook(fileIds: readonly FileId[], folderId: FolderId): Promise<void>;
  trashFiles(fileIds: readonly FileId[]): Promise<void>;
  trashNotebook(folder: Folder, sweptIds: readonly FileId[]): Promise<boolean>;
  downloadFiles(fileIds: readonly FileId[]): Promise<void>;
  createNote(folderIds?: readonly FolderId[]): Promise<void>;
  /** Starts a Ruth thread and opens it; the chat page sends `q` as the first message. */
  askRuth(
    question: string,
    scope?: { folderId?: FolderId | undefined; fileIds?: readonly FileId[] | undefined },
  ): Promise<void>;
}

const LibraryContext = createContext<LibraryState | undefined>(undefined);

export function useLibrary(): LibraryState {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary must be used inside <LibraryProvider>.");
  return value;
}

function byNewest(a: LibraryFile, b: LibraryFile) {
  return b.createdAt.localeCompare(a.createdAt);
}

/** Loads notebooks and files once (in parallel) for everything below it, with optimistic actions. */
export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const router = useRouter();
  const folders = useQuery((client) => client["library.listFolders"](), "library-folders");
  const files = useQuery((client) => client["library.listFiles"]({}), "library-files");

  const activeFiles = useMemo(
    () => files.data?.filter((file) => file.placement !== "archived").toSorted(byNewest),
    [files.data],
  );
  const activeFolders = useMemo(
    () =>
      folders.data
        ?.filter((folder) => folder.archivedAt === null)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [folders.data],
  );
  const folderById = useMemo(
    () => new Map((folders.data ?? []).map((folder) => [folder.id, folder] as const)),
    [folders.data],
  );

  const setFiles = files.setData;
  const setFolders = folders.setData;
  const refetchFiles = files.refetch;
  const refetchFolders = folders.refetch;

  const refetch = useCallback(() => {
    void refetchFiles();
    void refetchFolders();
  }, [refetchFiles, refetchFolders]);

  const actions = useMemo<LibraryActions>(
    () => ({
      async createNotebook(input) {
        const folder = await call(api, (client) => client["library.createFolder"](input));
        setFolders((previous) => (previous ? [folder, ...previous] : [folder]));
        invalidateLibrary(api, ["folders"]);
        return folder;
      },

      async moveFiles(fileIds, folder) {
        const ids = new Set(fileIds);
        let snapshot: readonly LibraryFile[] | undefined;
        setFiles((previous) => {
          snapshot = previous;
          return previous?.map((file) =>
            ids.has(file.id)
              ? { ...file, folderIds: [folder.id], placement: "filed" as const }
              : file,
          );
        });
        try {
          await Promise.all(
            fileIds.map((fileId) =>
              call(api, (client) =>
                client["library.placeFile"]({ fileId, folderIds: [folder.id] }),
              ),
            ),
          );
          toast(`Moved ${plural(fileIds.length, "source")} to ${folder.name}`);
        } catch (cause) {
          if (snapshot) setFiles(snapshot);
          toast.error(`Couldn't move: ${errorMessage(cause)}`);
        } finally {
          invalidateLibrary(api, ["files", "folders"]);
        }
      },

      async renameFile(fileId, title) {
        try {
          const updated = await call(api, (client) =>
            client["library.renameFile"]({ fileId, title }),
          );
          setFiles((previous) => previous?.map((file) => (file.id === fileId ? updated : file)));
          invalidateLibrary(api, ["files", "notes"]);
        } catch (cause) {
          toast.error(`Couldn't rename: ${errorMessage(cause)}`);
          throw cause;
        }
      },

      async removeFilesFromNotebook(fileIds, folderId) {
        // Re-read each file so memberships in other notebooks are preserved.
        try {
          await Promise.all(
            fileIds.map(async (fileId) => {
              const file = await call(api, (client) => client["library.getFile"]({ fileId }));
              if (!file.folderIds.includes(folderId)) return;
              const updated = await call(api, (client) =>
                client["library.placeFile"]({
                  fileId,
                  folderIds: file.folderIds.filter((id) => id !== folderId),
                }),
              );
              setFiles((previous) =>
                previous?.map((item) => (item.id === fileId ? updated : item)),
              );
            }),
          );
          toast("Removed from notebook");
        } catch (cause) {
          toast.error(`Couldn't remove from notebook: ${errorMessage(cause)}`);
        } finally {
          invalidateLibrary(api, ["files", "folders"]);
        }
      },

      async trashFiles(fileIds) {
        const ids = new Set(fileIds);
        let snapshot: readonly LibraryFile[] | undefined;
        setFiles((previous) => {
          snapshot = previous;
          return previous?.filter((file) => !ids.has(file.id));
        });
        try {
          await call(api, (client) => client["library.trashFiles"]({ fileIds: [...fileIds] }));
          toast(`Moved ${plural(fileIds.length, "file")} to Trash`, {
            description: "Deleted for good in 30 days.",
            action: {
              label: "Undo",
              onClick: () => {
                void call(api, (client) =>
                  client["library.restore"]({
                    refs: fileIds.map((id) => ({ _tag: "file" as const, id })),
                  }),
                )
                  .then(() => invalidateLibrary(api))
                  .catch((cause: unknown) =>
                    toast.error(`Couldn't restore: ${errorMessage(cause)}`),
                  );
              },
            },
          });
        } catch (cause) {
          if (snapshot) setFiles(snapshot);
          toast.error(`Couldn't move to Trash: ${errorMessage(cause)}`);
        } finally {
          invalidateLibrary(api);
        }
      },

      async trashNotebook(folder, sweptIds) {
        const ids = new Set(sweptIds);
        let fileSnapshot: readonly LibraryFile[] | undefined;
        let folderSnapshot: readonly Folder[] | undefined;
        setFiles((previous) => {
          fileSnapshot = previous;
          return previous?.filter((file) => !ids.has(file.id));
        });
        setFolders((previous) => {
          folderSnapshot = previous;
          return previous?.map((item) =>
            item.id === folder.id ? { ...item, archivedAt: new Date().toISOString() } : item,
          );
        });
        try {
          await call(api, (client) => client["library.trashFolder"]({ folderId: folder.id }));
          toast(`Moved ${folder.name} to Trash`, {
            description: "Deleted for good in 30 days.",
            action: {
              label: "Undo",
              onClick: () => {
                void call(api, (client) =>
                  client["library.restore"]({ refs: [{ _tag: "folder" as const, id: folder.id }] }),
                )
                  .then(() => invalidateLibrary(api))
                  .catch((cause: unknown) =>
                    toast.error(`Couldn't restore: ${errorMessage(cause)}`),
                  );
              },
            },
          });
          return true;
        } catch (cause) {
          if (fileSnapshot)
            setFiles((previous) => [
              ...(previous ?? []),
              ...fileSnapshot!.filter(
                (file) => ids.has(file.id) && !previous?.some((item) => item.id === file.id),
              ),
            ]);
          const original = folderSnapshot?.find((item) => item.id === folder.id);
          if (original)
            setFolders((previous) =>
              previous?.map((item) => (item.id === folder.id ? original : item)),
            );
          toast.error(`Couldn't move to Trash: ${errorMessage(cause)}`);
          return false;
        } finally {
          invalidateLibrary(api);
        }
      },

      async downloadFiles(fileIds) {
        try {
          const urls = await Promise.all(
            fileIds.map((fileId) =>
              call(api, (client) => client["library.getFileContentUrl"]({ fileId })),
            ),
          );
          for (const { url } of urls) {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "";
            anchor.target = "_blank";
            anchor.rel = "noopener";
            anchor.click();
          }
        } catch (cause) {
          toast.error(`Couldn't download: ${errorMessage(cause)}`);
        }
      },

      async createNote(folderIds = []) {
        try {
          const note = await call(api, (client) =>
            client["library.createNote"]({
              title: "Untitled",
              markdown: "",
              folderIds: [...folderIds],
              source: "user",
            }),
          );
          setFiles((previous) => (previous ? [note, ...previous] : [note]));
          invalidateLibrary(api, ["files", "folders", "notes"]);
          router.push(`/notes/${note.id}`);
        } catch (cause) {
          toast.error(`Couldn't create the note: ${errorMessage(cause)}`);
        }
      },

      async askRuth(question, scope) {
        const text = question.trim();
        if (!text) return;
        try {
          const thread = await call(api, (client) =>
            client["ruth.createThread"]({
              title: text.slice(0, 120),
              ...(scope?.folderId ? { folderId: scope.folderId } : {}),
            }),
          );
          invalidateLibrary(api, ["threads"]);
          const params = new URLSearchParams({ q: text });
          if (scope?.fileIds?.length) params.set("files", scope.fileIds.join(","));
          router.push(`/chat/${thread.id}?${params.toString()}`);
        } catch (cause) {
          toast.error(`Couldn't reach Ava: ${errorMessage(cause)}`);
        }
      },
    }),
    [api, router, setFiles, setFolders],
  );

  const value = useMemo<LibraryState>(
    () => ({
      folders: activeFolders,
      files: activeFiles,
      folderById,
      error: folders.error ?? files.error,
      refetch,
      actions,
    }),
    [activeFolders, activeFiles, folderById, folders.error, files.error, refetch, actions],
  );

  return (
    <LibraryContext.Provider value={value}>
      {children}
      <LibraryPrefetch />
    </LibraryContext.Provider>
  );
}
