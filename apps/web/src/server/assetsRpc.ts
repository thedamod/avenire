/** Asset handlers share the domain implementation and the complete authenticated RPC transport. */
export { AssetsHandlers, AssetsHandlersLive } from "./domainRpc.ts";
export { handleRpc as handleAssetsRpc } from "./rpc.ts";
