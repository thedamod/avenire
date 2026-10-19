import { Asset } from "./assets.ts";
/**
 * The typed API every client (web, desktop, mobile) uses to talk to the Avenire server.
 * Handlers live in `apps/web/src/server`; clients in `@avenire/client-runtime`.
 */
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";

import { CaptureSnapshot } from "./capture.ts";
import { CloudRun, CloudTask, CloudTaskInput, PendingApproval } from "./cloud.ts";
import { ApiError } from "./errors.ts";
import { FolderId, FileId } from "./ids.ts";
import { IngestionJob } from "./ingestion.ts";
import { CanvasNode, Folder, LibraryFile, FilePlacement } from "./library.ts";
import { SearchQuery, SearchResult } from "./retrieval.ts";
import { RuthMessage, RuthThread } from "./ruth.ts";
import { Authenticated } from "./session.ts";
import {
  CloudRunIdRequest,
  CloudTaskIdRequest,
  CreateThreadRequest,
  GetAssetRequest,
  ListAssetsRequest,
  ListCloudApprovalsRequest,
  ListCloudRunsRequest,
  ResolveCloudApprovalRequest,
  ResolveCloudRunRequest,
  SetThreadAccessRequest,
  ThreadMessagesRequest,
  UpdateCloudTaskRequest,
} from "./http.ts";

export const SubmitCaptureResult = Schema.Struct({
  files: Schema.Array(LibraryFile),
  /** Candidates dropped by policy, with the reason shown in the capture receipt. */
  skipped: Schema.Array(Schema.Struct({ title: Schema.String, reason: Schema.String })),
});
export type SubmitCaptureResult = typeof SubmitCaptureResult.Type;

export class LibraryRpcs extends RpcGroup.make(
  Rpc.make("library.recordFileEvent", {
    payload: { fileId: FileId, kind: Schema.Literal("opened") },
    error: ApiError,
  }),
  Rpc.make("library.submitCapture", {
    payload: { snapshot: CaptureSnapshot },
    success: SubmitCaptureResult,
    error: ApiError,
  }),
  Rpc.make("library.listFiles", {
    payload: { placement: Schema.optional(FilePlacement), folderId: Schema.optional(FolderId) },
    success: Schema.Array(LibraryFile),
    error: ApiError,
  }),
  Rpc.make("library.placeFile", {
    payload: { fileId: FileId, folderIds: Schema.Array(FolderId) },
    success: LibraryFile,
    error: ApiError,
  }),
  Rpc.make("library.listFolders", { success: Schema.Array(Folder), error: ApiError }),
  Rpc.make("library.renameFolder", {
    payload: { folderId: FolderId, name: Schema.NonEmptyString },
    success: Folder,
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
    payload: { fileId: FileId, paused: Schema.Boolean },
    success: IngestionJob,
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class SearchRpcs extends RpcGroup.make(
  Rpc.make("search.query", {
    payload: SearchQuery,
    success: SearchResult,
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class RuthRpcs extends RpcGroup.make(
  Rpc.make("ruth.listThreads", { success: Schema.Array(RuthThread), error: ApiError }),
  Rpc.make("ruth.createThread", {
    payload: CreateThreadRequest,
    success: RuthThread,
    error: ApiError,
  }),
  Rpc.make("ruth.listMessages", {
    payload: ThreadMessagesRequest,
    success: Schema.Array(RuthMessage),
    error: ApiError,
  }),
  Rpc.make("ruth.setFullAccess", {
    payload: SetThreadAccessRequest,
    success: RuthThread,
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class CloudRpcs extends RpcGroup.make(
  Rpc.make("cloud.listTasks", { success: Schema.Array(CloudTask), error: ApiError }),
  Rpc.make("cloud.createTask", { payload: CloudTaskInput, success: CloudTask, error: ApiError }),
  Rpc.make("cloud.updateTask", {
    payload: UpdateCloudTaskRequest,
    success: CloudTask,
    error: ApiError,
  }),
  Rpc.make("cloud.deleteTask", { payload: CloudTaskIdRequest, error: ApiError }),
  Rpc.make("cloud.runTaskNow", {
    payload: CloudTaskIdRequest,
    success: CloudRun,
    error: ApiError,
  }),
  Rpc.make("cloud.listPendingApprovals", {
    payload: ListCloudApprovalsRequest,
    success: Schema.Array(PendingApproval),
    error: ApiError,
  }),
  Rpc.make("cloud.resolveApproval", {
    payload: ResolveCloudApprovalRequest,
    success: PendingApproval,
    error: ApiError,
  }),
  Rpc.make("cloud.resolveRun", {
    payload: ResolveCloudRunRequest,
    success: Schema.Array(PendingApproval),
    error: ApiError,
  }),
  Rpc.make("cloud.listRuns", {
    payload: ListCloudRunsRequest,
    success: Schema.Array(CloudRun),
    error: ApiError,
  }),
  Rpc.make("cloud.cancelRun", {
    payload: CloudRunIdRequest,
    success: CloudRun,
    error: ApiError,
  }),
).middleware(Authenticated) {}

export class AssetsRpcs extends RpcGroup.make(
  Rpc.make("assets.get", { payload: GetAssetRequest, success: Asset, error: ApiError }),
  Rpc.make("assets.list", {
    payload: ListAssetsRequest,
    success: Schema.Array(Asset),
    error: ApiError,
  }),
).middleware(Authenticated) {}

export const AvenireRpcs = LibraryRpcs.merge(SearchRpcs, RuthRpcs, CloudRpcs, AssetsRpcs);
export type AvenireRpcs = typeof AvenireRpcs;

/** Path the RPC endpoint is mounted on, relative to the web server origin. */
export const RPC_PATH = "/api/rpc";
