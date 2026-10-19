import { AssetStore, authorizeAsset, publicAsset } from "@avenire/ai/outputs/assets";
import * as Option from "effect/Option";
import { CloudReview } from "@avenire/ai/cloud/review";
import { ThreadStore } from "@avenire/ai/ruth";
import { CloudTasks } from "@avenire/ai/scheduler";
import {
  AssetsRpcs,
  GetAssetRequest,
  ListAssetsRequest,
  NotFound,
  CloudRpcs,
  CurrentUser,
  RuthRpcs,
  SearchRpcs,
  type CloudRunIdRequest,
  type CloudTaskIdRequest,
  type CloudTaskInput,
  type CreateThreadRequest,
  type ListCloudApprovalsRequest,
  type ListCloudRunsRequest,
  type ResolveCloudApprovalRequest,
  type ResolveCloudRunRequest,
  type SearchQuery,
  type SetThreadAccessRequest,
  type ThreadMessagesRequest,
  type UpdateCloudTaskRequest,
} from "@avenire/contracts";
import { Retrieval } from "@avenire/ingestion/retrieval";
import * as Effect from "effect/Effect";
import { sanitizeApiDefects, toApiError } from "./apiErrors.ts";

/** Kept as plain handlers so the HTTP RPC composition can select a lean runtime per domain. */
export const SearchHandlers = {
  "search.query": Effect.fn("SearchRpc.query")(function* (query: SearchQuery) {
    const viewer = yield* CurrentUser;
    const retrieval = yield* Retrieval;
    return yield* retrieval
      .search(viewer.id, query)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
};
export const RuthHandlers = {
  "ruth.listThreads": Effect.fn("RuthRpc.listThreads")(function* () {
    const viewer = yield* CurrentUser;
    const threads = yield* ThreadStore;
    return yield* threads
      .listThreads(viewer.id)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "ruth.createThread": Effect.fn("RuthRpc.createThread")(function* (
    input: typeof CreateThreadRequest.Type,
  ) {
    const viewer = yield* CurrentUser;
    const threads = yield* ThreadStore;
    return yield* threads
      .createThread(viewer.id, input.title)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "ruth.listMessages": Effect.fn("RuthRpc.listMessages")(function* ({
    threadId,
  }: typeof ThreadMessagesRequest.Type) {
    const viewer = yield* CurrentUser;
    const threads = yield* ThreadStore;
    return yield* threads
      .listMessages(viewer.id, threadId)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "ruth.setFullAccess": Effect.fn("RuthRpc.setFullAccess")(function* ({
    threadId,
    enabled,
  }: typeof SetThreadAccessRequest.Type) {
    const viewer = yield* CurrentUser;
    const threads = yield* ThreadStore;
    return yield* threads
      .setFullAccess(viewer.id, threadId, enabled)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
};
export const CloudHandlers = {
  "cloud.listTasks": Effect.fn("CloudRpc.listTasks")(function* () {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks.list(viewer.id).pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.createTask": Effect.fn("CloudRpc.createTask")(function* (input: CloudTaskInput) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .create(viewer.id, input)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.updateTask": Effect.fn("CloudRpc.updateTask")(function* ({
    taskId,
    patch,
  }: typeof UpdateCloudTaskRequest.Type) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .update(viewer.id, taskId, patch)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.deleteTask": Effect.fn("CloudRpc.deleteTask")(function* ({
    taskId,
  }: typeof CloudTaskIdRequest.Type) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .delete(viewer.id, taskId)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.runTaskNow": Effect.fn("CloudRpc.runTaskNow")(function* ({
    taskId,
  }: typeof CloudTaskIdRequest.Type) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .runNow(viewer.id, taskId)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.listRuns": Effect.fn("CloudRpc.listRuns")(function* ({
    limit,
  }: typeof ListCloudRunsRequest.Type) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .listRuns(viewer.id, limit)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.cancelRun": Effect.fn("CloudRpc.cancelRun")(function* ({
    runId,
  }: typeof CloudRunIdRequest.Type) {
    const viewer = yield* CurrentUser;
    const tasks = yield* CloudTasks;
    return yield* tasks
      .cancelRun(viewer.id, runId)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.listPendingApprovals": Effect.fn("CloudRpc.listPendingApprovals")(function* ({
    runId,
  }: typeof ListCloudApprovalsRequest.Type) {
    const viewer = yield* CurrentUser;
    const review = yield* CloudReview;
    return yield* review
      .list(viewer.id, runId)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.resolveApproval": Effect.fn("CloudRpc.resolveApproval")(function* ({
    approvalId,
    decision,
  }: typeof ResolveCloudApprovalRequest.Type) {
    const viewer = yield* CurrentUser;
    const review = yield* CloudReview;
    return yield* review
      .resolve(viewer.id, approvalId, decision)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
  "cloud.resolveRun": Effect.fn("CloudRpc.resolveRun")(function* ({
    runId,
    decision,
  }: typeof ResolveCloudRunRequest.Type) {
    const viewer = yield* CurrentUser;
    const review = yield* CloudReview;
    return yield* review
      .resolveRun(viewer.id, runId, decision)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
};

export const SearchHandlersLive = SearchRpcs.toLayer(SearchHandlers);
export const RuthHandlersLive = RuthRpcs.toLayer(RuthHandlers);
export const CloudHandlersLive = CloudRpcs.toLayer(CloudHandlers);

export const AssetsHandlers = {
  "assets.get": Effect.fn("AssetsRpc.get")(function* ({ assetId }: typeof GetAssetRequest.Type) {
    const viewer = yield* CurrentUser;
    const assets = yield* AssetStore;
    const entry = yield* assets.get(assetId).pipe(Effect.mapError(toApiError), sanitizeApiDefects);
    if (Option.isNone(entry) || !authorizeAsset(entry.value, viewer.id))
      return yield* new NotFound({ entity: "Asset", id: assetId });
    return publicAsset(entry.value);
  }),
  "assets.list": Effect.fn("AssetsRpc.list")(function* (filters: typeof ListAssetsRequest.Type) {
    const viewer = yield* CurrentUser;
    const assets = yield* AssetStore;
    return yield* assets
      .list(viewer.id, filters)
      .pipe(Effect.mapError(toApiError), sanitizeApiDefects);
  }),
};
export const AssetsHandlersLive = AssetsRpcs.toLayer(AssetsHandlers);
