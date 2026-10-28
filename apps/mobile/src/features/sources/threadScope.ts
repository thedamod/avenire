import type { ChatScope, ThreadId } from "@avenire/contracts";
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
