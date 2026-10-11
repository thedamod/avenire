import * as Schema from "effect/Schema";
import { AssetId, CloudRunId, ThreadId } from "./ids.ts";

export const AssetKind = Schema.Literals(["widget", "image", "video", "pdf", "file"]);
export type AssetKind = typeof AssetKind.Type;
/** Extend this schema with link/people when per-asset grants are implemented. */
export const AssetVisibility = Schema.Literal("private");
export type AssetVisibility = typeof AssetVisibility.Type;
export const Asset = Schema.Struct({
  id: AssetId,
  kind: AssetKind,
  title: Schema.String,
  mediaType: Schema.String,
  sizeBytes: Schema.Int,
  createdAt: Schema.String,
  threadId: Schema.optionalKey(ThreadId),
  runId: Schema.optionalKey(CloudRunId),
  url: Schema.String,
});
export type Asset = typeof Asset.Type;
