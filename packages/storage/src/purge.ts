/** The irreversible claim separates reversible archival from destructive storage work. */
import type { FileId, UserId } from "@avenire/contracts";
import * as Effect from "effect/Effect";

import { filePrefix } from "./keys.ts";
import { Storage, type StorageError } from "./storage.ts";

export interface FilePurgeRepository<E, R> {
  /** Atomically claim an expired owned file, or resume its existing irreversible claim. */
  readonly claim: (userId: UserId, fileId: FileId) => Effect.Effect<boolean, E, R>;
  /** Delete only the still-claimed owned row, after its objects have been removed. */
  readonly complete: (userId: UserId, fileId: FileId) => Effect.Effect<boolean, E, R>;
}

/**
 * Claim first, then remove objects, then complete. A failed/interrupted cleanup leaves
 * its durable claim intact: restore cannot race it, and another tick can resume it.
 */
export const makeFilePurger = <E, R>(repository: FilePurgeRepository<E, R>) =>
  Effect.fn("Archive.purgeFile")(function* (userId: UserId, fileId: FileId) {
    if (!(yield* repository.claim(userId, fileId))) return false;
    const storage = yield* Storage;
    const removed = yield* Effect.gen(function* () {
      const prefix = filePrefix(userId, fileId);
      const objects = yield* storage.list(prefix);
      // A provider returning a neighboring key must never turn into cross-file deletion.
      yield* Effect.forEach(
        objects.filter(({ key }) => key.startsWith(prefix)),
        ({ key }) => storage.remove(key),
        { discard: true },
      );
      return true;
    }).pipe(
      Effect.catchTag("StorageError", (error: StorageError) =>
        Effect.as(
          Effect.logWarning("Archive purge storage failed; retaining purge claim", {
            fileId,
            error,
          }),
          false,
        ),
      ),
    );
    return removed ? yield* repository.complete(userId, fileId) : false;
  });
