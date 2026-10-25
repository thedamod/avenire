import type { FolderId, ThreadId } from "@avenire/contracts";
import type { ClientRuntime } from "@avenire/client-runtime/rpc";
import { threadChat } from "~/features/chat/chatStore";
import { prefetchQuery } from "~/lib/rpc";

export function prefetchNotebook(api: ClientRuntime, folderId: FolderId) {
  return Promise.all([
    prefetchQuery(
      api,
      (client) => client["library.getFolder"]({ folderId }),
      `notebook-folders-${folderId}`,
    ),
    prefetchQuery(
      api,
      (client) => client["library.listFiles"]({ folderId }),
      `notebook-files-${folderId}`,
    ),
  ]);
}

export function prefetchChat(api: ClientRuntime, threadId: ThreadId) {
  return Promise.all([
    prefetchQuery(api, (client) => client["ruth.getThread"]({ threadId }), `threads:${threadId}`),
    // Speculative history failures are retried by the chat page and must not interrupt navigation.
    threadChat(api, threadId)
      .hydrate()
      .catch(() => {}),
  ]);
}
