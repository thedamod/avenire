import type { ChatScope, FileId, FolderId, ThreadId } from "@avenire/contracts";
import type { ClientRuntime } from "@avenire/client-runtime/rpc";

const initialScopes = new WeakMap<ClientRuntime, Map<ThreadId, ChatScope>>();

export function rememberInitialThreadScope(
  api: ClientRuntime,
  threadId: ThreadId,
  scope: ChatScope,
) {
  let scopes = initialScopes.get(api);
  if (!scopes) initialScopes.set(api, (scopes = new Map()));
  scopes.set(threadId, scope);
}

export function takeInitialThreadScope(api: ClientRuntime, threadId: ThreadId) {
  const scopes = initialScopes.get(api);
  const scope = scopes?.get(threadId);
  scopes?.delete(threadId);
  return scope;
}

/** Same as web's scopeWith: a turn's references widen the thread's scope for that turn only. */
export function turnScope(
  base: ChatScope | undefined,
  folderId: FolderId | null | undefined,
  references: readonly { kind: "file" | "folder"; id: string }[] | undefined,
): ChatScope | undefined {
  if (!references?.length) return base;
  const start = base ?? (folderId ? { folderIds: [folderId] } : {});
  const folderIds = new Set<string>(start.folderIds ?? []);
  const fileIds = new Set<string>(start.fileIds ?? []);
  for (const reference of references)
    (reference.kind === "folder" ? folderIds : fileIds).add(reference.id);
  return {
    ...(folderIds.size ? { folderIds: [...folderIds] as FolderId[] } : {}),
    ...(fileIds.size ? { fileIds: [...fileIds] as FileId[] } : {}),
  };
}
