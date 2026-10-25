import { useRef, useState } from "react";
import { Linking } from "react-native";
import { call, invalidateLibrary, type ClientRuntime } from "@avenire/client-runtime/rpc";
import type { ChatScope, FileId, FolderId, LibraryFile, ThreadId } from "@avenire/contracts";
import { useQuery } from "../../lib/useRpc";
import { useApi } from "../../state/api";

// Chat's typed route currently has no fileIds. The chat owner can consume this once,
// before sending its initial q, and pass it as RuthChatRequest.scope.
const initialScopes = new WeakMap<ClientRuntime, Map<ThreadId, ChatScope>>();
export function takeInitialThreadScope(
  api: ClientRuntime,
  threadId: ThreadId,
): ChatScope | undefined {
  const scopes = initialScopes.get(api);
  const scope = scopes?.get(threadId);
  scopes?.delete(threadId);
  return scope;
}

export function useLibraryFiles() {
  const query = useQuery((client) => client["library.listFiles"]({}), "filing-files");
  return { ...query, files: query.data?.filter((file) => file.placement !== "archived") };
}
export function useNotebooks() {
  const query = useQuery((client) => client["library.listFolders"](), "filing-folders");
  return { ...query, folders: query.data?.filter((folder) => folder.archivedAt === null) };
}

export function useSourceActions() {
  const api = useApi();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
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
    run,
    move: (fileIds: readonly FileId[], folderId: FolderId) =>
      run(async () => {
        // As on web, "Move" replaces the notebook memberships.
        await Promise.all(
          fileIds.map((fileId) =>
            call(api, (client) => client["library.placeFile"]({ fileId, folderIds: [folderId] })),
          ),
        );
        return true;
      }),
    trash: (fileIds: readonly FileId[]) =>
      run(async () => {
        await call(api, (client) => client["library.trashFiles"]({ fileIds: [...fileIds] }));
        return true;
      }),
    download: (fileIds: readonly FileId[]) =>
      run(async () => {
        const urls = await Promise.all(
          fileIds.map((fileId) =>
            call(api, (client) => client["library.getFileContentUrl"]({ fileId })),
          ),
        );
        for (const { url } of urls) await Linking.openURL(url);
        return true;
      }),
    ask: (question: string, fileIds: readonly FileId[], folderId?: FolderId) =>
      run(async () => {
        const thread = await call(api, (client) =>
          client["ruth.createThread"]({
            title: question.slice(0, 120),
            ...(folderId ? { folderId } : {}),
          }),
        );
        let scopes = initialScopes.get(api);
        if (!scopes) initialScopes.set(api, (scopes = new Map()));
        scopes.set(thread.id, {
          fileIds: [...fileIds],
          ...(folderId ? { folderIds: [folderId] } : {}),
        });
        invalidateLibrary(api, ["threads"]);
        return thread;
      }),
  };
}
export function sourceHost(file: Pick<LibraryFile, "sourceUrl" | "kind">) {
  if (file.sourceUrl) {
    try {
      return new URL(file.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return "Captured source";
    }
  }
  return file.kind === "image" ? "Photo" : "Downloads";
}
export function fileIconType(file: LibraryFile) {
  return file.kind === "web-page" ? "web" : file.kind;
}
