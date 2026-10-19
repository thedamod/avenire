import { CurrentUser, LibraryRpcs } from "@avenire/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { sanitizeApiDefects } from "./apiErrors.ts";
import { InternalError } from "@avenire/contracts";
import { Library } from "./library.ts";

/** The same ownership boundary serves RPC and REST. */
export const LibraryHandlersLive = LibraryRpcs.toLayer({
  "library.getCanvas": () =>
    Effect.gen(function* () {
      return yield* (yield* Library).getCanvas((yield* CurrentUser).id);
    }).pipe(sanitizeApiDefects),
  "library.saveCanvas": ({ nodes }) =>
    Effect.gen(function* () {
      return yield* (yield* Library).saveCanvas((yield* CurrentUser).id, nodes);
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
