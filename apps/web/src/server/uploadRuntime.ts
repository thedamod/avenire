/** Uploads need database, authentication and files-sdk storage; no model/provider credentials. */
import { DatabaseLive } from "@avenire/database/client";
import { StorageLive } from "@avenire/storage/storage";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Layer from "effect/Layer";
import { AuthServicesLive } from "./authRuntime.ts";
import { domainRuntime } from "./applicationRuntime.ts";
import { SourceUploadsLive } from "./sourceUploads.ts";

export const UploadServicesLive = SourceUploadsLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthServicesLive, DatabaseLive, StorageLive, NodeServices.layer),
  ),
);
export const runUploadRoute = domainRuntime(UploadServicesLive).runRoute;
