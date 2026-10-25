/** Request schemas shared by RPC and the HTTP adapters used by every application. */
import * as Schema from "effect/Schema";
import { ApprovalDecision, CloudTaskInput } from "./cloud.ts";
import { Folder, FolderColor, FolderCover, TrashRef } from "./library.ts";
import {
  AssetId,
  CloudRunId,
  CloudTaskId,
  FileId,
  FolderId,
  PendingApprovalId,
  ThreadId,
} from "./ids.ts";

const Title = Schema.NonEmptyString.check(Schema.isMaxLength(200));

export const CreateFolderRequest = Schema.Struct({
  name: Folder.fields.name,
  color: Schema.optionalKey(FolderColor),
  cover: Schema.optionalKey(FolderCover),
});
export const UpdateFolderRequest = Schema.Struct({
  folderId: FolderId,
  name: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(120))),
  color: Schema.optionalKey(FolderColor),
  cover: Schema.optionalKey(FolderCover),
});
export const FileIdRequest = Schema.Struct({ fileId: FileId });
export const FolderIdRequest = Schema.Struct({ folderId: FolderId });
export const RenameFileRequest = Schema.Struct({ fileId: FileId, title: Title });
export const CreateNoteRequest = Schema.Struct({
  title: Title,
  markdown: Schema.String.check(Schema.isMaxLength(1_000_000)),
  folderIds: Schema.Array(FolderId).check(Schema.isMaxLength(20)),
  source: Schema.optionalKey(Schema.Literals(["user", "chat"])),
});
export const SaveNoteRequest = Schema.Struct({
  fileId: FileId,
  title: Schema.optionalKey(Title),
  markdown: Schema.String.check(Schema.isMaxLength(1_000_000)),
  /** The revision the edit started from; a stale one fails with Conflict. */
  baseRevision: Schema.String,
});
export const TrashFilesRequest = Schema.Struct({
  fileIds: Schema.Array(FileId).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
});
export const TrashRefsRequest = Schema.Struct({
  refs: Schema.Array(TrashRef).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
});

export const CreateThreadRequest = Schema.Struct({
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  folderId: Schema.optionalKey(FolderId),
});
export const ThreadIdRequest = Schema.Struct({ threadId: ThreadId });
export const RenameThreadRequest = Schema.Struct({ threadId: ThreadId, title: Title });

export const ThreadMessagesRequest = Schema.Struct({ threadId: ThreadId });
export const SetThreadAccessRequest = Schema.Struct({
  threadId: ThreadId,
  enabled: Schema.Boolean,
});
export const CloudTaskPatch = Schema.Struct({
  title: Schema.optionalKey(CloudTaskInput.fields.title),
  prompt: Schema.optionalKey(CloudTaskInput.fields.prompt),
  model: CloudTaskInput.fields.model,
  network: CloudTaskInput.fields.network,
  schedule: Schema.optionalKey(CloudTaskInput.fields.schedule),
  timeZone: Schema.optionalKey(CloudTaskInput.fields.timeZone),
  preHydration: Schema.optionalKey(CloudTaskInput.fields.preHydration),
  delivery: Schema.optionalKey(CloudTaskInput.fields.delivery),
  enabled: Schema.optionalKey(CloudTaskInput.fields.enabled),
});
export const UpdateCloudTaskRequest = Schema.Struct({ taskId: CloudTaskId, patch: CloudTaskPatch });
export const CloudTaskIdRequest = Schema.Struct({ taskId: CloudTaskId });
export const CloudRunIdRequest = Schema.Struct({ runId: CloudRunId });
export const ListCloudRunsRequest = Schema.Struct({
  taskId: Schema.optionalKey(CloudTaskId),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
});
export const ListCloudApprovalsRequest = Schema.Struct({
  runId: Schema.optionalKey(CloudRunId),
  includeResolved: Schema.optionalKey(Schema.Boolean),
});
export const ResolveCloudApprovalRequest = Schema.Struct({
  approvalId: PendingApprovalId,
  decision: ApprovalDecision,
});
export const ResolveCloudRunRequest = Schema.Struct({
  runId: CloudRunId,
  decision: ApprovalDecision,
});
export const GetAssetRequest = Schema.Struct({ assetId: AssetId });
export const ListAssetsRequest = Schema.Struct({
  threadId: Schema.optionalKey(ThreadId),
  runId: Schema.optionalKey(CloudRunId),
});
