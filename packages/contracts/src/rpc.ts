/**
 * The typed API every client (web, desktop, mobile) uses to talk to the Avenire server.
 * Handlers live in `apps/web/src/server`; clients in `@avenire/client-runtime`.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { CaptureSnapshot } from "./capture.ts";
import { Artifact, CloudRun, CloudSchedule } from "./cloud.ts";
import { ApiError } from "./errors.ts";
import { ApprovalId, ArtifactId, ClusterId, CloudRunId, ItemId, ThreadId } from "./ids.ts";
import { IngestionJob } from "./ingestion.ts";
import { CanvasNode, Cluster, Item, ItemPlacement } from "./library.ts";
import { SearchHit, SearchQuery } from "./retrieval.ts";
import { ApprovalDecision, Message, RuthEvent } from "./ruth.ts";
import { Authenticated } from "./session.ts";

export const SubmitCaptureResult = Schema.Struct({
  items: Schema.Array(Item),
  /** Candidates dropped by policy, with the reason shown in the capture receipt. */
  skipped: Schema.Array(Schema.Struct({ title: Schema.String, reason: Schema.String })),
});
export type SubmitCaptureResult = typeof SubmitCaptureResult.Type;

export class LibraryRpcs extends RpcGroup.make(
  Rpc.make("library.submitCapture", {
    payload: { snapshot: CaptureSnapshot },
    success: SubmitCaptureResult,
    error: ApiError,
  }),
  Rpc.make("library.listItems", {
    payload: { placement: Schema.optional(ItemPlacement), clusterId: Schema.optional(ClusterId) },
    success: Schema.Array(Item),
    error: ApiError,
  }),
  Rpc.make("library.fileItem", {
    payload: { itemId: ItemId, clusterIds: Schema.Array(ClusterId) },
    success: Item,
    error: ApiError,
  }),
  Rpc.make("library.listClusters", { success: Schema.Array(Cluster), error: ApiError }),
  Rpc.make("library.renameCluster", {
    payload: { clusterId: ClusterId, name: Schema.NonEmptyString },
    success: Cluster,
    error: ApiError,
  }),
  Rpc.make("library.getCanvas", { success: Schema.Array(CanvasNode), error: ApiError }),
  Rpc.make("library.saveCanvas", {
    payload: { nodes: Schema.Array(CanvasNode) },
    error: ApiError,
  }),
  Rpc.make("library.watchIngestion", {
    success: IngestionJob,
    error: ApiError,
    stream: true,
  }),
  Rpc.make("library.setIngestionPaused", {
    payload: { itemId: ItemId, paused: Schema.Boolean },
    success: IngestionJob,
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class SearchRpcs extends RpcGroup.make(
  Rpc.make("search.query", {
    payload: SearchQuery,
    success: Schema.Array(SearchHit),
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class RuthRpcs extends RpcGroup.make(
  Rpc.make("ruth.listMessages", {
    payload: { threadId: ThreadId },
    success: Schema.Array(Message),
    error: ApiError,
  }),
  Rpc.make("ruth.send", {
    payload: { threadId: Schema.optional(ThreadId), text: Schema.NonEmptyString },
    success: RuthEvent,
    error: ApiError,
    stream: true,
  }),
  Rpc.make("ruth.decide", {
    payload: { approvalId: ApprovalId, decision: ApprovalDecision },
    success: RuthEvent,
    error: ApiError,
    stream: true,
  }),
).middleware(Authenticated) {}

export class CloudRpcs extends RpcGroup.make(
  Rpc.make("cloud.listRuns", {
    payload: { limit: Schema.optional(Schema.Int) },
    success: Schema.Array(CloudRun),
    error: ApiError,
  }),
  Rpc.make("cloud.getSchedule", { success: CloudSchedule, error: ApiError }),
  Rpc.make("cloud.setSchedule", { payload: CloudSchedule, success: CloudSchedule, error: ApiError }),
  Rpc.make("cloud.runNow", { success: CloudRun, error: ApiError }),
  Rpc.make("cloud.cancelRun", { payload: { runId: CloudRunId }, success: CloudRun, error: ApiError }),
  Rpc.make("cloud.artifactUrl", {
    payload: { artifactId: ArtifactId },
    success: Schema.Struct({ artifact: Artifact, url: Schema.String }),
    error: ApiError,
  }),
).middleware(Authenticated) {}

export const AvenireRpcs = LibraryRpcs.merge(SearchRpcs, RuthRpcs, CloudRpcs);
export type AvenireRpcs = typeof AvenireRpcs;

/** Path the RPC endpoint is mounted on, relative to the web server origin. */
export const RPC_PATH = "/api/rpc";
