/** Separate lazy scopes keep library reads and Cloud enqueue independent of chat providers. */
import { CloudRunEventsLive } from "@avenire/ai/cloud/events";
import { CloudReviewLive } from "@avenire/ai/cloud/review";
import { AssetStoreLive } from "@avenire/ai/outputs/assets";
import { ThreadStoreLive } from "@avenire/ai/ruth";
import { CloudTasksLive } from "@avenire/ai/scheduler";
import { AuthServicesLive } from "./authRuntime.ts";
import { DatabaseLive } from "@avenire/database/client";
import { StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { HttpRequestError } from "./http.ts";
import * as Stream from "effect/Stream";
import { Library, LibraryLive } from "./library.ts";
import { RetrievalServicesLive } from "./services.ts";
import { toApiError } from "./apiErrors.ts";

const DataLive = Layer.mergeAll(DatabaseLive, NodeServices.layer);
const AuthDataLive = AuthServicesLive.pipe(Layer.provideMerge(DataLive));
const StoredDataLive = StorageLive.pipe(Layer.provideMerge(AuthDataLive));
export const LibraryServicesLive = LibraryLive.pipe(Layer.provideMerge(StoredDataLive));
export const ThreadServicesLive = ThreadStoreLive.pipe(Layer.provideMerge(AuthDataLive));
export const SearchServicesLive = RetrievalServicesLive.pipe(Layer.provideMerge(AuthDataLive));
export const CloudServicesLive = Layer.mergeAll(
  CloudTasksLive,
  CloudReviewLive,
  CloudRunEventsLive,
).pipe(Layer.provideMerge(AssetStoreLive), Layer.provideMerge(StoredDataLive));

/** A runtime is created on first use of its domain, and interrupted with its calling request. */
export const domainRuntime = <R, E>(layer: Layer.Layer<R, E>) => {
  let runtime: ManagedRuntime.ManagedRuntime<R, E> | undefined;
  const current = () => (runtime ??= ManagedRuntime.make(layer));
  const provide = <A, E2>(effect: Effect.Effect<A, E2, R>) =>
    Effect.promise((signal) => current().runPromiseExit(effect, { signal })).pipe(Effect.flatten);
  const runRoute = <E2>(effect: Effect.Effect<Response, E2, R>): Promise<Response> =>
    current()
      .runPromise(
        effect.pipe(
          Effect.catchIf(
            (error): error is E2 & HttpRequestError => error instanceof HttpRequestError,
            (error) =>
              Effect.succeed(Response.json({ error: error.message }, { status: error.status })),
          ),
          Effect.catchCause((cause) =>
            Effect.logError("Application route failed", cause).pipe(
              Effect.as(
                Response.json({ error: "The request could not be completed." }, { status: 500 }),
              ),
            ),
          ),
        ),
      )
      .catch(() => Response.json({ error: "The service is unavailable." }, { status: 503 }));
  return {
    provide: <A, E2>(effect: Effect.Effect<A, E2, R>) =>
      provide(effect).pipe(Effect.mapError(toApiError)),
    runRoute,
  };
};
const library = domainRuntime(LibraryServicesLive);
const threads = domainRuntime(ThreadServicesLive);
const search = domainRuntime(SearchServicesLive);
const cloud = domainRuntime(CloudServicesLive);
export const provideLibrary = library.provide;
export const provideThreads = threads.provide;
export const provideSearch = search.provide;
export const provideCloud = cloud.provide;
export const runLibraryRoute = library.runRoute;
export const runThreadRoute = threads.runRoute;
export const runSearchRoute = search.runRoute;
export const runCloudRoute = cloud.runRoute;

export const LibraryRpcService = Layer.succeed(Library, {
  getCanvas: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.getCanvas(...args))),
  saveCanvas: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.saveCanvas(...args))),
  listFiles: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.listFiles(...args))),
  getFile: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.getFile(...args))),
  submitCapture: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.submitCapture(...args))),
  placeFile: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.placeFile(...args))),
  listFolders: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.listFolders(...args))),
  createFolder: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.createFolder(...args))),
  renameFolder: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.renameFolder(...args))),
  recordFileEvent: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.recordFileEvent(...args))),
  setIngestionPaused: (...args) =>
    provideLibrary(Effect.flatMap(Library, (service) => service.setIngestionPaused(...args))),
  watchIngestion: (...args) =>
    Stream.unwrap(
      provideLibrary(Effect.map(Library, (service) => service.watchIngestion(...args))),
    ),
});
