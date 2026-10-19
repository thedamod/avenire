import { type ArtifactId, type ItemId, StorageKey, type UserId } from "@avenire/contracts";

const safeFilename = (filename: string): string =>
  filename.replace(/[\\/]/g, "_").replace(/\0/g, "").slice(0, 180) || "file";

export const userPrefix = (userId: UserId): StorageKey =>
  StorageKey.make(`users/${encodeURIComponent(userId)}/`);

export const itemPrefix = (userId: UserId, itemId: ItemId): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}items/${encodeURIComponent(itemId)}/`);

export const itemSourceKey = (userId: UserId, itemId: ItemId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}items/${encodeURIComponent(itemId)}/source/${safeFilename(filename)}`,
  );

/** The extracted document of an item's source, per extractor version. */
export const itemDocumentKey = (userId: UserId, itemId: ItemId, version: number): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}items/${encodeURIComponent(itemId)}/document.v${version}.json.gz`,
  );

export const artifactKey = (userId: UserId, artifactId: ArtifactId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}artifacts/${encodeURIComponent(artifactId)}/${safeFilename(filename)}`,
  );
