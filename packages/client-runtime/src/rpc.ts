/**
 * The typed Avenire RPC client shared by web, desktop and mobile. Runs anywhere
 * `fetch` exists (browsers, Electron renderer, Hermes); no Node built-ins.
 */
import { AvenireRpcs, RPC_PATH } from "@avenire/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Stream from "effect/Stream";

export type AvenireRpcClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof AvenireRpcs>,
  RpcClientError
>;

export class AvenireClient extends Context.Service<AvenireClient, AvenireRpcClient>()(
  "avenire/client/AvenireClient",
) {}

export interface ClientOptions {
  readonly baseUrl: string;
  /** Mobile passes the better-auth session cookie here; web and desktop rely on cookies. */
  readonly getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  readonly credentials?: RequestCredentials;
}

export const makeClientLayer = (options: ClientOptions) => {
  const { getAuthHeaders } = options;
  const http = FetchHttpClient.layer.pipe(
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { credentials: options.credentials ?? "include" }),
    ),
  );
  const protocol = RpcClient.layerProtocolHttp({
    url: `${options.baseUrl}${RPC_PATH}`,
    ...(getAuthHeaders === undefined
      ? {}
      : {
          transformClient: HttpClient.mapRequestEffect((request) =>
            Effect.promise(async () => HttpClientRequest.setHeaders(request, await getAuthHeaders())),
          ),
        }),
  }).pipe(Layer.provide(Layer.mergeAll(RpcSerialization.layerNdjson, http)));

  return Layer.effect(AvenireClient, RpcClient.make(AvenireRpcs)).pipe(Layer.provide(protocol));
};

export const makeClientRuntime = (options: ClientOptions) =>
  ManagedRuntime.make(makeClientLayer(options));

export type ClientRuntime = ReturnType<typeof makeClientRuntime>;

/** Run one RPC as a Promise. Typed failures reject with the tagged error instance. */
export const call = <A, E>(
  runtime: ClientRuntime,
  fn: (client: AvenireRpcClient) => Effect.Effect<A, E>,
): Promise<A> => runtime.runPromise(Effect.flatMap(Effect.service(AvenireClient), fn));

/** Subscribe to a streaming RPC. Returns a function that cancels the subscription. */
export const stream = <A, E>(
  runtime: ClientRuntime,
  fn: (client: AvenireRpcClient) => Stream.Stream<A, E>,
  handlers: {
    readonly onEvent: (event: A) => void;
    readonly onError?: (cause: Cause.Cause<E>) => void;
  },
): (() => void) => {
  const cancel = runtime.runCallback(
    Effect.flatMap(Effect.service(AvenireClient), (client) =>
      Stream.runForEach(fn(client), (event) => Effect.sync(() => handlers.onEvent(event))),
    ),
    {
      onExit: (exit) => {
        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
          handlers.onError?.(exit.cause);
        }
      },
    },
  );
  return () => cancel();
};
