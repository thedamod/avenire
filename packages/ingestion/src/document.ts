/**
 * The extracted document of an item's source, kept in object storage (gzipped
 * JSON) keyed by extractor version. Re-ingesting unchanged bytes reuses it, so
 * OCR and transcription are paid for once per source and extractor version.
 */
import type { ItemId, UserId } from "@avenire/contracts";
import { itemDocumentKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

import { EXTRACTOR_VERSION, ExtractedDocument } from "./extract/types.ts";

const DocumentJson = Schema.fromJsonString(ExtractedDocument);
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export const documentKey = (userId: UserId, itemId: ItemId) =>
  itemDocumentKey(userId, itemId, EXTRACTOR_VERSION);

/** The stored document, or none when it's missing or no longer decodes. */
export const loadDocument = Effect.fn("Document.load")(function* (userId: UserId, itemId: ItemId) {
  const storage = yield* Storage;
  return yield* storage.get(documentKey(userId, itemId)).pipe(
    Effect.flatMap((bytes) => Effect.promise(() => gunzipAsync(bytes))),
    Effect.flatMap((json) => Schema.decodeUnknownEffect(DocumentJson)(json.toString("utf8"))),
    Effect.map(Option.some),
    Effect.catchCause((cause) =>
      Effect.as(
        Effect.logWarning("Stored document unusable; extracting again", cause),
        Option.none(),
      ),
    ),
  );
});

export const saveDocument = Effect.fn("Document.save")(function* (
  userId: UserId,
  itemId: ItemId,
  document: ExtractedDocument,
) {
  const storage = yield* Storage;
  const json = yield* Schema.encodeEffect(DocumentJson)(document).pipe(Effect.orDie);
  const body = yield* Effect.promise(() => gzipAsync(json));
  const key = documentKey(userId, itemId);
  yield* storage.put(key, body, { contentType: "application/gzip" });
  return key;
});
