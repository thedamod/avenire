import type { ArtifactId, ItemId, StorageKey, UserId } from "@avenire/contracts";

const safeFilename = (filename: string): string =>
  filename.replace(/[\\/]/g, "_").replace(/\0/g, "").slice(0, 180) || "file";

export const userPrefix = (userId: UserId): StorageKey =>
  `users/${encodeURIComponent(userId)}/` as StorageKey;

export const itemSourceKey = (userId: UserId, itemId: ItemId, filename: string): StorageKey =>
  `${userPrefix(userId)}items/${encodeURIComponent(itemId)}/source/${safeFilename(filename)}` as StorageKey;

export const artifactKey = (userId: UserId, artifactId: ArtifactId, filename: string): StorageKey =>
  `${userPrefix(userId)}artifacts/${encodeURIComponent(artifactId)}/${safeFilename(filename)}` as StorageKey;
