/** Protocol composition stays independently testable without live infrastructure or providers. */
import { AvenireRpcs } from "@avenire/contracts";
import * as Layer from "effect/Layer";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import { LibraryHandlersLive } from "./libraryRpc.ts";
import {
  AssetsHandlersLive,
  CloudHandlersLive,
  RuthHandlersLive,
  SearchHandlersLive,
} from "./domainRpc.ts";

export const ApplicationHandlersLive = Layer.mergeAll(
  LibraryHandlersLive,
  SearchHandlersLive,
  RuthHandlersLive,
  CloudHandlersLive,
  AssetsHandlersLive,
);
export const rpcRoutes = <A, E, R>(handlers: Layer.Layer<A, E, R>) =>
  RpcServer.layerHttp({ group: AvenireRpcs, path: "/api/rpc", protocol: "http" }).pipe(
    Layer.provide(handlers),
    Layer.provide(RpcSerialization.layerNdjson),
  );
