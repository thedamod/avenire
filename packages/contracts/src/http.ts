/** Request schemas shared by RPC and the HTTP adapters used by every application. */
import * as Schema from "effect/Schema";
import { ApprovalDecision, CloudTaskInput } from "./cloud.ts";
import { Folder } from "./library.ts";
import { AssetId, CloudRunId, CloudTaskId, PendingApprovalId, ThreadId } from "./ids.ts";

export const CreateFolderRequest = Schema.Struct({ name: Folder.fields.name });

export const CreateThreadRequest = Schema.Struct({
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
});
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
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
});
export const ListCloudApprovalsRequest = Schema.Struct({ runId: Schema.optionalKey(CloudRunId) });
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
