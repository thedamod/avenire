import { type ArtifactId, type ItemId, StorageKey, type UserId } from "@avenire/contracts";

const safeFilename = (filename: string): string =>
  filename.replace(/[\\/]/g, "_").replace(/\0/g, "").slice(0, 180) || "file";

export const userPrefix = (userId: UserId): StorageKey =>
  StorageKey.make(`users/${encodeURIComponent(userId)}/`);

export const itemSourceKey = (userId: UserId, itemId: ItemId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}items/${encodeURIComponent(itemId)}/source/${safeFilename(filename)}`,
  );

export const artifactKey = (userId: UserId, artifactId: ArtifactId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}artifacts/${encodeURIComponent(artifactId)}/${safeFilename(filename)}`,
  );
