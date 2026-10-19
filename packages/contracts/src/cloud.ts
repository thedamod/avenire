/**
 * Ruth Cloud - scheduled sandboxed work that produces study assets and proposed syncs.
 *
 * Changes to existing material are represented as pending approvals.
 */
import * as Schema from "effect/Schema";

import { CloudRunId, CloudTaskId, FileId, PendingApprovalId } from "./ids.ts";

import { Asset } from "./assets.ts";
import { HydrationRule } from "./hydration.ts";

export const CloudRunStatus = Schema.Literals([
  "scheduled",
  "provisioning",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type CloudRunStatus = typeof CloudRunStatus.Type;

export const CloudRun = Schema.Struct({
  id: CloudRunId,
  status: CloudRunStatus,
  taskId: CloudTaskId,
  taskTitle: Schema.String,
  /** Scheduled occurrence (ISO), shared by retries. */
  scheduledFor: Schema.String,
  attempt: Schema.Int,
  summary: Schema.NullOr(Schema.String),
  startedAt: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  assets: Schema.Array(Asset),
});
export type CloudRun = typeof CloudRun.Type;

/** Task schedules use Effect's `_tag` discriminator. Times are ISO strings. */
export const CloudTaskSchedule = Schema.Union([
  Schema.TaggedStruct("cron", { expression: Schema.String }),
  Schema.TaggedStruct("once", { at: Schema.String }),
]);
export type CloudTaskSchedule = typeof CloudTaskSchedule.Type;

export const CloudTaskDelivery = Schema.Struct({ email: Schema.Boolean });
export type CloudTaskDelivery = typeof CloudTaskDelivery.Type;

const CloudModelName = Schema.Literals(["ruth-sprint", "ruth-core", "ruth-apex"]);
const CloudNetwork = Schema.Literals(["packages", "open"]);

export const CloudTaskInput = Schema.Struct({
  title: Schema.NonEmptyString.check(Schema.isMaxLength(200)),
  prompt: Schema.NonEmptyString.check(Schema.isMaxLength(20_000)),
  model: Schema.optionalKey(CloudModelName),
  network: Schema.optionalKey(CloudNetwork),
  schedule: CloudTaskSchedule,
  timeZone: Schema.String.check(Schema.isMaxLength(100)),
  preHydration: Schema.Array(HydrationRule).check(Schema.isMaxLength(20)),
  delivery: CloudTaskDelivery,
  enabled: Schema.Boolean,
});
export type CloudTaskInput = typeof CloudTaskInput.Type;

export const CloudTask = Schema.Struct({
  id: CloudTaskId,
  ...CloudTaskInput.fields,
  builtin: Schema.NullOr(Schema.Literal("nightly-digest")),
  nextRunAt: Schema.NullOr(Schema.String),
  lastRunAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type CloudTask = typeof CloudTask.Type;

/** Path of the Cloud run start/stream endpoint; `<path>/<runId>/stream` replays and tails a run. */
export const CLOUD_RUN_PATH = "/api/ruth/cloud";

/**
 * Body of a `CLOUD_RUN_PATH` request: a one-off prompt, or an existing task to run now.
 * The response is the run's UI message stream, with the run id in `x-ruth-run-id`.
 */
export const CloudRunRequest = Schema.Union([
  Schema.Struct({
    prompt: Schema.NonEmptyString.check(Schema.isMaxLength(20_000)),
    model: Schema.optionalKey(CloudModelName),
    network: Schema.optionalKey(CloudNetwork),
    timeZone: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ taskId: CloudTaskId }),
]);
export type CloudRunRequest = typeof CloudRunRequest.Type;

export const PendingApprovalStatus = Schema.Literals([
  "pending",
  "accepted",
  "skipped",
  "conflict",
]);
export type PendingApprovalStatus = typeof PendingApprovalStatus.Type;

export const PendingApproval = Schema.Struct({
  id: PendingApprovalId,
  runId: CloudRunId,
  fileId: FileId,
  fileTitle: Schema.String,
  kind: Schema.Literal("sync"),
  status: PendingApprovalStatus,
  conflict: Schema.NullOr(Schema.String),
  summary: Schema.String,
  proposedSize: Schema.Int,
  createdAt: Schema.String,
  resolvedAt: Schema.NullOr(Schema.String),
});
export type PendingApproval = typeof PendingApproval.Type;

export const ApprovalDecision = Schema.Literals(["accept", "skip"]);
export type ApprovalDecision = typeof ApprovalDecision.Type;
