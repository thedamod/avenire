/**
 * Ruth Cloud - the nightly sandboxed run that turns the day's material into study artifacts.
 *
 * One run per user per day. A run only sees items touched in its window and
 * writes artifacts; it never edits or deletes the user's existing material.
 */
import * as Schema from "effect/Schema";

import { ArtifactId, CloudRunId, ItemId, StorageKey } from "./ids.ts";

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
  sourceItemIds: Schema.Array(ItemId),
  createdAt: Schema.String,
});
export type Artifact = typeof Artifact.Type;

export const CloudRun = Schema.Struct({
  id: CloudRunId,
  status: CloudRunStatus,
  /** Start of the material window this run covers (ISO). */
  windowStart: Schema.String,
  windowEnd: Schema.String,
  startedAt: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  artifacts: Schema.Array(Artifact),
});
export type CloudRun = typeof CloudRun.Type;

export const CloudSchedule = Schema.Struct({
  enabled: Schema.Boolean,
  /** Local wall-clock time, `HH:mm`. */
  runAt: Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)),
  timeZone: Schema.String,
  artifactKinds: Schema.Array(ArtifactKind),
});
export type CloudSchedule = typeof CloudSchedule.Type;
