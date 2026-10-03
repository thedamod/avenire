/**
 * Library - the user's material: inbox items, clusters and the canvas that lays them out.
 *
 * An item can belong to several clusters (the canvas draws the extra memberships
 * as links), so membership is a relation, not a column on the item.
 */
import * as Schema from "effect/Schema";

import { CanvasNodeId, CaptureId, ClusterId, ItemId, StorageKey } from "./ids.ts";

export const ItemKind = Schema.Literals([
  "pdf",
  "document",
  "web-page",
  "video",
  "audio",
  "image",
  "note",
  "selection",
]);
export type ItemKind = typeof ItemKind.Type;

/** `inbox` until the user (or clustering) files it; `archived` hides it from the canvas. */
export const ItemPlacement = Schema.Literals(["inbox", "filed", "archived"]);
export type ItemPlacement = typeof ItemPlacement.Type;

export const Item = Schema.Struct({
  id: ItemId,
  kind: ItemKind,
  title: Schema.String,
  placement: ItemPlacement,
  sourceUrl: Schema.NullOr(Schema.String),
  storageKey: Schema.NullOr(StorageKey),
  mimeType: Schema.NullOr(Schema.String),
  sizeBytes: Schema.NullOr(Schema.Number),
  captureId: Schema.NullOr(CaptureId),
  clusterIds: Schema.Array(ClusterId),
  /** Seek position for media captured mid-playback. */
  mediaPositionSec: Schema.NullOr(Schema.Number),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type Item = typeof Item.Type;

export const Cluster = Schema.Struct({
  id: ClusterId,
  name: Schema.String,
  /** Set when the name came from automatic clustering rather than the user. */
  suggested: Schema.Boolean,
  itemCount: Schema.Number,
  createdAt: Schema.String,
});
export type Cluster = typeof Cluster.Type;

export const CanvasNodeRef = Schema.Union([
  Schema.TaggedStruct("item", { itemId: ItemId }),
  Schema.TaggedStruct("cluster", { clusterId: ClusterId }),
  Schema.TaggedStruct("sketch", { strokes: Schema.Unknown }),
]);
export type CanvasNodeRef = typeof CanvasNodeRef.Type;

export const CanvasNode = Schema.Struct({
  id: CanvasNodeId,
  ref: CanvasNodeRef,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
});
export type CanvasNode = typeof CanvasNode.Type;
