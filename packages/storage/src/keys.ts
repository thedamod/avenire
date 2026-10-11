import { type AssetId, type FileId, StorageKey, type UserId } from "@avenire/contracts";

const safeFilename = (filename: string): string =>
  filename.replace(/[\\/]/g, "_").replace(/\0/g, "").slice(0, 180) || "file";

export const userPrefix = (userId: UserId): StorageKey =>
  StorageKey.make(`users/${encodeURIComponent(userId)}/`);

export const filePrefix = (userId: UserId, fileId: FileId): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}files/${encodeURIComponent(fileId)}/`);

export const fileSourceKey = (userId: UserId, fileId: FileId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}files/${encodeURIComponent(fileId)}/source/${safeFilename(filename)}`,
  );

/** The extracted document of an file's source, per extractor version. */
export const fileDocumentKey = (userId: UserId, fileId: FileId, version: number): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}files/${encodeURIComponent(fileId)}/document.v${version}.json.gz`,
  );

export const assetKey = (userId: UserId, assetId: AssetId, filename: string): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}.avenire/assets/${encodeURIComponent(assetId)}/${safeFilename(filename)}`,
  );
