import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as Option from "effect/Option";
import { SettingsHandlers } from "./settingsRpc.ts";
import { AuthenticationLive } from "@avenire/auth/middleware";
import {
  type ApiError,
  AssetsRpcs,
  CloudRpcs,
  CurrentUser,
  RuthRpcs,
  SearchRpcs,
  SettingsRpcs,
} from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/http/HttpRouter";
import { AuthServicesLive } from "./authRuntime.ts";
import {
  LibraryRpcService,
  domainRuntime,
  provideCloud,
  provideSearch,
  provideThreads,
  provideSettings,
} from "./applicationRuntime.ts";
import { AssetsHandlers, CloudHandlers, RuthHandlers, SearchHandlers } from "./domainRpc.ts";
import { LibraryHandlersLive } from "./libraryRpc.ts";
import { OutputServicesLive } from "./outputRuntime.ts";
import { assertRpcRequest } from "./session.ts";
import { HttpRequestError } from "./http.ts";
import { boundedRpcRequest } from "./rpcRequest.ts";

const output = domainRuntime(OutputServicesLive);
/** Explicitly transfer only the verified user into each domain's independent runtime. */
const inDomain = <A, E, R>(
  effect: Effect.Effect<A, E, R | CurrentUser>,
  provide: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, ApiError>,
) =>
  Effect.flatMap(CurrentUser, (user) => provide(Effect.provideService(effect, CurrentUser, user)));

const DomainHandlersLive = Layer.mergeAll(
  SettingsRpcs.toLayer({
    "settings.get": () =>
      Effect.gen(function* () {
        const request = yield* Effect.serviceOption(HttpServerRequest.HttpServerRequest);
        const timeZone = Option.isSome(request)
          ? request.value.headers["x-avenire-time-zone"]
          : undefined;
        return yield* inDomain(SettingsHandlers["settings.get"](timeZone), provideSettings);
      }),
    "settings.update": (input) =>
      inDomain(SettingsHandlers["settings.update"](input), provideSettings),
    "settings.completeOnboarding": (input) =>
      inDomain(SettingsHandlers["settings.completeOnboarding"](input), provideSettings),
    "settings.updateProfile": (input) =>
      inDomain(SettingsHandlers["settings.updateProfile"](input), provideSettings),
    "settings.signOutOtherSessions": () =>
      inDomain(SettingsHandlers["settings.signOutOtherSessions"](), provideSettings),
  }),
  SearchRpcs.toLayer({
    "search.query": (input) => inDomain(SearchHandlers["search.query"](input), provideSearch),
  }),
  RuthRpcs.toLayer({
    "ruth.getThread": (input) => inDomain(RuthHandlers["ruth.getThread"](input), provideThreads),
    "ruth.renameThread": (input) =>
      inDomain(RuthHandlers["ruth.renameThread"](input), provideThreads),
    "ruth.deleteThread": (input) =>
      inDomain(RuthHandlers["ruth.deleteThread"](input), provideThreads),
    "ruth.listThreads": () => inDomain(RuthHandlers["ruth.listThreads"](), provideThreads),
    "ruth.createThread": (input) =>
      inDomain(RuthHandlers["ruth.createThread"](input), provideThreads),
    "ruth.listMessages": (input) =>
      inDomain(RuthHandlers["ruth.listMessages"](input), provideThreads),
    "ruth.setFullAccess": (input) =>
      inDomain(RuthHandlers["ruth.setFullAccess"](input), provideThreads),
  }),
  CloudRpcs.toLayer({
    "cloud.getRun": (input) => inDomain(CloudHandlers["cloud.getRun"](input), provideCloud),
    "cloud.listTasks": () => inDomain(CloudHandlers["cloud.listTasks"](), provideCloud),
    "cloud.createTask": (input) => inDomain(CloudHandlers["cloud.createTask"](input), provideCloud),
    "cloud.updateTask": (input) => inDomain(CloudHandlers["cloud.updateTask"](input), provideCloud),
    "cloud.deleteTask": (input) => inDomain(CloudHandlers["cloud.deleteTask"](input), provideCloud),
    "cloud.runTaskNow": (input) => inDomain(CloudHandlers["cloud.runTaskNow"](input), provideCloud),
    "cloud.listPendingApprovals": (input) =>
      inDomain(CloudHandlers["cloud.listPendingApprovals"](input), provideCloud),
    "cloud.resolveApproval": (input) =>
      inDomain(CloudHandlers["cloud.resolveApproval"](input), provideCloud),
    "cloud.resolveRun": (input) => inDomain(CloudHandlers["cloud.resolveRun"](input), provideCloud),
    "cloud.listRuns": (input) => inDomain(CloudHandlers["cloud.listRuns"](input), provideCloud),
    "cloud.cancelRun": (input) => inDomain(CloudHandlers["cloud.cancelRun"](input), provideCloud),
  }),
  AssetsRpcs.toLayer({
    "assets.get": (input) => inDomain(AssetsHandlers["assets.get"](input), output.provide),
    "assets.list": (input) => inDomain(AssetsHandlers["assets.list"](input), output.provide),
  }),
);

export { rpcRoutes } from "./rpcProtocol.ts";
import { rpcRoutes } from "./rpcProtocol.ts";
const Routes = rpcRoutes(
  Layer.mergeAll(
    LibraryHandlersLive.pipe(Layer.provide(LibraryRpcService)),
    DomainHandlersLive,
    AuthenticationLive.pipe(Layer.provide(AuthServicesLive)),
  ),
);
const makeRpc = () => HttpRouter.toWebHandler(Routes, { disableLogger: true });
let rpc: ReturnType<typeof makeRpc> | undefined;
export const handleRpc = async (request: Request): Promise<Response> => {
  const checked = await Effect.runPromise(
    assertRpcRequest(request).pipe(
      Effect.andThen(() => boundedRpcRequest(request)),
      Effect.catchTag("HttpRequestError", (error) => Effect.succeed(error)),
      Effect.catchCause(() =>
        Effect.succeed(
          new HttpRequestError({ status: 503, message: "The service is unavailable." }),
        ),
      ),
    ),
  );
  if (checked instanceof HttpRequestError)
    return Response.json({ error: checked.message }, { status: checked.status });
  try {
    return await (rpc ??= makeRpc()).handler(checked);
  } catch {
    return Response.json({ error: "The service is unavailable." }, { status: 503 });
  }
};
