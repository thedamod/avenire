/**
 * Ruth Cloud - scheduled sandboxed work that produces study artifacts and proposed syncs.
 *
 * Changes to existing material are represented as pending approvals.
 */
import * as Schema from "effect/Schema";

import {
  ArtifactId,
  CloudRunId,
  CloudTaskId,
  FileId,
  PendingApprovalId,
  StorageKey,
} from "./ids.ts";

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

export const ArtifactKind = Schema.Literals([
  "notes",
  "quiz",
  "flashcards",
  "research",
  "summary",
  "recording",
  "plot",
  "video",
]);
export type ArtifactKind = typeof ArtifactKind.Type;

export const Artifact = Schema.Struct({
  id: ArtifactId,
  kind: ArtifactKind,
  title: Schema.String,
  storageKey: StorageKey,
  mimeType: Schema.String,
  sourceFileIds: Schema.Array(FileId),
  createdAt: Schema.String,
});
export type Artifact = typeof Artifact.Type;

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
  artifacts: Schema.Array(Artifact),
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

export const CloudTaskInput = Schema.Struct({
  title: Schema.NonEmptyString,
  prompt: Schema.NonEmptyString,
  schedule: CloudTaskSchedule,
  timeZone: Schema.String,
  preHydration: Schema.Array(HydrationRule),
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
