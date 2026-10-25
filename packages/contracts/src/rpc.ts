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
import {
  FileContentUrl,
  Folder,
  LibraryFile,
  FilePlacement,
  NoteContent,
  TrashEntry,
} from "./library.ts";
import { SearchQuery, SearchResult } from "./retrieval.ts";
import { RuthMessage, RuthThread } from "./ruth.ts";
import { Authenticated } from "./session.ts";
import {
  OnboardingPreferences,
  OnboardingState,
  SettingsSnapshot,
  UserSettings,
  UserSettingsPatch,
} from "./settings.ts";
import {
  CloudRunIdRequest,
  CloudTaskIdRequest,
  CreateFolderRequest,
  CreateNoteRequest,
  CreateThreadRequest,
  FileIdRequest,
  FolderIdRequest,
  RenameFileRequest,
  RenameThreadRequest,
  SaveNoteRequest,
  ThreadIdRequest,
  TrashFilesRequest,
  TrashRefsRequest,
  UpdateFolderRequest,
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
  Rpc.make("library.getFile", { payload: FileIdRequest, success: LibraryFile, error: ApiError }),
  Rpc.make("library.renameFile", {
    payload: RenameFileRequest,
    success: LibraryFile,
    error: ApiError,
  }),
  Rpc.make("library.getFileContentUrl", {
    payload: FileIdRequest,
    success: FileContentUrl,
    error: ApiError,
  }),
  /** Notes are markdown files (`kind: "note"`). */
  Rpc.make("library.createNote", {
    payload: CreateNoteRequest,
    success: LibraryFile,
    error: ApiError,
  }),
  Rpc.make("library.getNote", { payload: FileIdRequest, success: NoteContent, error: ApiError }),
  Rpc.make("library.saveNote", { payload: SaveNoteRequest, success: NoteContent, error: ApiError }),
  Rpc.make("library.placeFile", {
    payload: { fileId: FileId, folderIds: Schema.Array(FolderId) },
    success: LibraryFile,
    error: ApiError,
  }),
  Rpc.make("library.listFolders", { success: Schema.Array(Folder), error: ApiError }),
  Rpc.make("library.getFolder", { payload: FolderIdRequest, success: Folder, error: ApiError }),
  Rpc.make("library.createFolder", {
    payload: CreateFolderRequest,
    success: Folder,
    error: ApiError,
  }),
  Rpc.make("library.updateFolder", {
    payload: UpdateFolderRequest,
    success: Folder,
    error: ApiError,
  }),
  /** Trash = archive; the purge job deletes for good 30 days later. */
  Rpc.make("library.trashFiles", { payload: TrashFilesRequest, error: ApiError }),
  Rpc.make("library.trashFolder", { payload: FolderIdRequest, error: ApiError }),
  Rpc.make("library.listTrash", { success: Schema.Array(TrashEntry), error: ApiError }),
  Rpc.make("library.restore", { payload: TrashRefsRequest, error: ApiError }),
  /** Delete for good now: hands the entries to the purge job instead of waiting 30 days. */
  Rpc.make("library.purge", { payload: TrashRefsRequest, error: ApiError }),
  Rpc.make("library.emptyTrash", { error: ApiError }),
  Rpc.make("library.renameFolder", {
    payload: { folderId: FolderId, name: Schema.NonEmptyString },
    success: Folder,
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
  Rpc.make("ruth.getThread", { payload: ThreadIdRequest, success: RuthThread, error: ApiError }),
  Rpc.make("ruth.renameThread", {
    payload: RenameThreadRequest,
    success: RuthThread,
    error: ApiError,
  }),
  Rpc.make("ruth.deleteThread", { payload: ThreadIdRequest, error: ApiError }),
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
  Rpc.make("cloud.getRun", { payload: CloudRunIdRequest, success: CloudRun, error: ApiError }),
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

export class SettingsRpcs extends RpcGroup.make(
  Rpc.make("settings.get", { success: SettingsSnapshot, error: ApiError }),
  Rpc.make("settings.update", {
    payload: UserSettingsPatch,
    success: UserSettings,
    error: ApiError,
  }),
  Rpc.make("settings.completeOnboarding", {
    payload: OnboardingPreferences,
    success: OnboardingState,
    error: ApiError,
  }),
  Rpc.make("settings.updateProfile", {
    payload: { name: Schema.NonEmptyString.check(Schema.isMaxLength(100)) },
    error: ApiError,
  }),
  Rpc.make("settings.signOutOtherSessions", { error: ApiError }),
).middleware(Authenticated) {}

export const AvenireRpcs = LibraryRpcs.merge(
  SearchRpcs,
  RuthRpcs,
  CloudRpcs,
  AssetsRpcs,
  SettingsRpcs,
);
export type AvenireRpcs = typeof AvenireRpcs;

/** Path the RPC endpoint is mounted on, relative to the web server origin. */
export const RPC_PATH = "/api/rpc";
