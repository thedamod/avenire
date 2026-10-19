/**
 * Library - the user's material: inbox items, clusters and the canvas that lays them out.
 *
 * An item can belong to several clusters (the canvas draws the extra memberships
 * as links), so membership is a relation, not a column on the item.
 */
import * as Schema from "effect/Schema";

import { CanvasNodeId, CaptureId, ClusterId, ItemId, ItemEventId, StorageKey } from "./ids.ts";

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

/** Where the item entered the library. */
export const ItemSource = Schema.Literals(["upload", "capture", "ruth", "ruth-cloud"]);
export type ItemSource = typeof ItemSource.Type;

export const ItemEventKind = Schema.Literals(["opened", "edited", "captured", "uploaded"]);
export type ItemEventKind = typeof ItemEventKind.Type;

export const ItemEvent = Schema.Struct({
  id: ItemEventId,
  itemId: ItemId,
  kind: ItemEventKind,
  /** Event time (ISO). */
  at: Schema.String,
});
export type ItemEvent = typeof ItemEvent.Type;

export const Item = Schema.Struct({
  id: ItemId,
  kind: ItemKind,
  title: Schema.String,
  placement: ItemPlacement,
  source: ItemSource,
  tags: Schema.Array(Schema.String),
  /** Last content change (ISO); null until the original content has changed. */
  contentModifiedAt: Schema.NullOr(Schema.String),
  /** Archive time (ISO); null while active. */
  archivedAt: Schema.NullOr(Schema.String),
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
