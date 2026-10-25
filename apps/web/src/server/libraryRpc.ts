import { CurrentUser, LibraryRpcs } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { sanitizeApiDefects } from "./apiErrors.ts";
import { InternalError } from "@avenire/contracts";
import { Library } from "./library.ts";

/** The same ownership boundary serves RPC and REST. */
export const LibraryHandlersLive = LibraryRpcs.toLayer({
  "library.getFile": ({ fileId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).getFile((yield* CurrentUser).id, fileId);
    }).pipe(sanitizeApiDefects),
  "library.renameFile": ({ fileId, title }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).renameFile((yield* CurrentUser).id, fileId, title);
    }).pipe(sanitizeApiDefects),
  "library.getFileContentUrl": ({ fileId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).getFileContentUrl((yield* CurrentUser).id, fileId);
    }).pipe(sanitizeApiDefects),
  "library.createNote": (input) =>
    Effect.gen(function* () {
      return yield* (yield* Library).createNote((yield* CurrentUser).id, input);
    }).pipe(sanitizeApiDefects),
  "library.getNote": ({ fileId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).getNote((yield* CurrentUser).id, fileId);
    }).pipe(sanitizeApiDefects),
  "library.saveNote": (input) =>
    Effect.gen(function* () {
      return yield* (yield* Library).saveNote((yield* CurrentUser).id, input);
    }).pipe(sanitizeApiDefects),
  "library.getFolder": ({ folderId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).getFolder((yield* CurrentUser).id, folderId);
    }).pipe(sanitizeApiDefects),
  "library.updateFolder": (input) =>
    Effect.gen(function* () {
      return yield* (yield* Library).updateFolder((yield* CurrentUser).id, input);
    }).pipe(sanitizeApiDefects),
  "library.trashFiles": ({ fileIds }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).trashFiles((yield* CurrentUser).id, fileIds);
    }).pipe(sanitizeApiDefects),
  "library.trashFolder": ({ folderId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).trashFolder((yield* CurrentUser).id, folderId);
    }).pipe(sanitizeApiDefects),
  "library.restore": ({ refs }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).restore((yield* CurrentUser).id, refs);
    }).pipe(sanitizeApiDefects),
  "library.purge": ({ refs }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).purge((yield* CurrentUser).id, refs);
    }).pipe(sanitizeApiDefects),
  "library.listTrash": () =>
    Effect.gen(function* () {
      return yield* (yield* Library).listTrash((yield* CurrentUser).id);
    }).pipe(sanitizeApiDefects),
  "library.emptyTrash": () =>
    Effect.gen(function* () {
      return yield* (yield* Library).emptyTrash((yield* CurrentUser).id);
    }).pipe(sanitizeApiDefects),
  "library.createFolder": ({ name, ...options }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).createFolder((yield* CurrentUser).id, name, options);
    }).pipe(sanitizeApiDefects),
  "library.listFiles": (filters) =>
    Effect.gen(function* () {
      return yield* (yield* Library).listFiles((yield* CurrentUser).id, filters);
    }).pipe(sanitizeApiDefects),
  "library.submitCapture": ({ snapshot }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).submitCapture((yield* CurrentUser).id, snapshot);
    }).pipe(sanitizeApiDefects),
  "library.placeFile": ({ fileId, folderIds }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).placeFile((yield* CurrentUser).id, fileId, folderIds);
    }).pipe(sanitizeApiDefects),
  "library.listFolders": () =>
    Effect.gen(function* () {
      return yield* (yield* Library).listFolders((yield* CurrentUser).id);
    }).pipe(sanitizeApiDefects),
  "library.renameFolder": ({ folderId, name }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).renameFolder((yield* CurrentUser).id, folderId, name);
    }).pipe(sanitizeApiDefects),
  "library.recordFileEvent": ({ fileId }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).recordFileEvent((yield* CurrentUser).id, fileId);
    }).pipe(sanitizeApiDefects),
  "library.setIngestionPaused": ({ fileId, paused }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).setIngestionPaused((yield* CurrentUser).id, fileId, paused);
    }).pipe(sanitizeApiDefects),
  "library.watchIngestion": () =>
    Stream.unwrap(
      Effect.gen(function* () {
        return (yield* Library).watchIngestion((yield* CurrentUser).id);
      }),
    ).pipe(
      Stream.catchDefect((cause) =>
        Stream.fromEffect(
          Effect.logError("Ingestion stream failed", cause).pipe(
            Effect.andThen(Effect.fail(new InternalError({}))),
          ),
        ),
      ),
    ),
});
