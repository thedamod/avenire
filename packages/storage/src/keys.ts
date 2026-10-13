import { type FileId, StorageKey, type UserId } from "@avenire/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";

const safeFilename = (filename: string): string =>
  filename.replace(/[\\/]/g, "_").replace(/\0/g, "").slice(0, 180) || "file";

/**
 * A fresh segment that makes a key brand-new. UploadThing keys are write-once (probing, overwriting or
 * reusing a deleted key all fail), so every write that could be retried or replaced gets its own.
 * Keys stay short: UploadThing caps them at 128 characters.
 */
export const newKeyVersion = Effect.service(Crypto.Crypto).pipe(
  Effect.flatMap((crypto) => crypto.randomUUIDv4),
  Effect.map((uuid) => uuid.replaceAll("-", "").slice(-12)),
);

const VERSION_PREFIX = /^[0-9a-f]{12}-/;

/** The file name a source or asset key was made from, without its directory or version. */
export const keyFilename = (key: string): string =>
  (key.split("/").at(-1) ?? "file").replace(VERSION_PREFIX, "");

export const userPrefix = (userId: UserId): StorageKey =>
  StorageKey.make(`users/${encodeURIComponent(userId)}/`);

export const filePrefix = (userId: UserId, fileId: FileId): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}files/${encodeURIComponent(fileId)}/`);

/** A file's source object. `version` (from `newKeyVersion`) makes a replacement a new key. */
export const fileSourceKey = (
  userId: UserId,
  fileId: FileId,
  filename: string,
  version?: string,
): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}files/${encodeURIComponent(fileId)}/source/${
      version === undefined ? "" : `${version}-`
    }${safeFilename(filename)}`,
  );

/** The extracted document of a file's source, per extractor version. `version` is unique per save. */
export const fileDocumentKey = (
  userId: UserId,
  fileId: FileId,
  extractorVersion: number,
  version: string,
): StorageKey =>
  StorageKey.make(
    `${userPrefix(userId)}files/${encodeURIComponent(fileId)}/document.v${extractorVersion}.${version}.json.gz`,
  );

/** An asset's object; `version` (from `newKeyVersion`) is unique per write, so retries never collide. */
export const assetKey = (userId: UserId, version: string, filename: string): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}.avenire/assets/${version}/${safeFilename(filename)}`);

/** A Ruth Cloud proposed change awaiting review. Unique per proposal write. */
export const cloudProposalKey = (userId: UserId, version: string, filename: string): StorageKey =>
  StorageKey.make(`${userPrefix(userId)}.avenire/cloud/${version}/${safeFilename(filename)}`);
