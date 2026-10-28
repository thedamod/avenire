import { LibraryRpcs, FileId, RPC_PATH } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import type { AvenireUploadFetch } from "./source-acquisition.ts";

/** Resolve origins with the owner's frozen session, never with data supplied by the renderer. */
export function captureLibraryClient(appUrl: string, fetch: AvenireUploadFetch) {
  const protocol = RpcClient.layerProtocolHttp({
    url: new URL(RPC_PATH, appUrl).href,
    transformClient: HttpClient.mapRequest((request) =>
      HttpClientRequest.setUrl(request, request.url.replace(/\/$/, "")),
    ),
  }).pipe(Layer.provide(Layer.mergeAll(RpcSerialization.layerNdjson, FetchHttpClient.layer)));
  const run = <A, E>(
    operation: (
      client: RpcClient.RpcClient<
        import("effect/rpc/RpcGroup").Rpcs<typeof LibraryRpcs>,
        import("effect/rpc/RpcClientError").RpcClientError
      >,
    ) => Effect.Effect<A, E>,
  ) =>
    Effect.runPromise(
      Effect.scoped(Effect.flatMap(RpcClient.make(LibraryRpcs), operation)).pipe(
        Effect.provide(protocol),
        Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
          fetch(input instanceof Request ? input.url : String(input), init ?? {}),
        ),
      ),
      { signal: AbortSignal.timeout(5000) },
    );
  return {
    trash: (fileId: string) =>
      run((client) => client["library.trashFiles"]({ fileIds: [FileId.make(fileId)] })),
    getFile: (fileId: string) =>
      run((client) => client["library.getFile"]({ fileId: FileId.make(fileId) })),
    opened: (fileId: string) =>
      run((client) =>
        client["library.recordFileEvent"]({ fileId: FileId.make(fileId), kind: "opened" }),
      ),
  };
}
