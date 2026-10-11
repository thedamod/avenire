import { AssetStore, authorizeAsset, publicAsset } from "@avenire/ai/outputs/assets";
import { AuthService } from "@avenire/auth/server";
import {
  AssetsRpcs,
  Authenticated,
  CurrentUser,
  InternalError,
  NotFound,
  Unauthorized,
} from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpRouter from "effect/http/HttpRouter";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as RpcServer from "effect/rpc/RpcServer";
import { OutputServicesLive } from "./outputRuntime.ts";

export const AssetsHandlersLive = AssetsRpcs.toLayer(
  Effect.gen(function* () {
    const assets = yield* AssetStore;
    return {
      "assets.get": Effect.fn("AssetsRpc.get")(function* ({ assetId }) {
        const viewer = yield* CurrentUser;
        const found = yield* assets.get(assetId).pipe(Effect.mapError(() => new InternalError({})));
        if (Option.isNone(found) || !authorizeAsset(found.value, viewer.id))
          return yield* new NotFound({ entity: "Asset", id: assetId });
        return publicAsset(found.value);
      }),
      "assets.list": Effect.fn("AssetsRpc.list")(function* (filters) {
        const viewer = yield* CurrentUser;
        return yield* assets
          .list(viewer.id, filters)
          .pipe(Effect.mapError(() => new InternalError({})));
      }),
    };
  }),
);
const AuthenticationLive = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const auth = yield* AuthService;
    return Authenticated.of((effect, { headers }) =>
      auth.getSession(new Headers(headers)).pipe(
        Effect.mapError(() => new Unauthorized({})),
        Effect.flatMap((user) =>
          user
            ? Effect.provideService(effect, CurrentUser, user)
            : Effect.fail(new Unauthorized({})),
        ),
      ),
    );
  }),
);
const Routes = RpcServer.layerHttp({ group: AssetsRpcs, path: "/api/rpc", protocol: "http" }).pipe(
  Layer.provide(AssetsHandlersLive),
  Layer.provide(AuthenticationLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(OutputServicesLive),
);
const makeRpc = () => HttpRouter.toWebHandler(Routes, { disableLogger: true });
let rpc: ReturnType<typeof makeRpc> | undefined;
// Router lifetime is shared across requests, like the chat service runtime.
export const handleAssetsRpc = (request: Request) => {
  const handler = (rpc ??= makeRpc());
  return handler.handler(request);
};
