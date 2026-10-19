/**
 * The extracted document of an file's source, kept in object storage (gzipped
 * JSON). Re-ingesting unchanged bytes reuses it, so OCR and transcription are
 * paid for once per source and extractor version.
 *
 * Object keys are write-once and never probed (see `forUploadThing`): every save
 * writes a new key, and `file.document_key` is the only record of which one is
 * current, so a document is loaded only when the database says it exists.
 */
import type { FileId, StorageKey, UserId } from "@avenire/contracts";
import { fileDocumentKey, newKeyVersion } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";

import { EXTRACTOR_VERSION, ExtractedDocument } from "./extract/types.ts";

const StoredDocument = Schema.Struct({
  ...ExtractedDocument.fields,
  /** Automatic retries of transient incomplete extraction are bounded per source. */
  retryCount: Schema.optionalKey(Schema.Number),
});
export type StoredDocument = typeof StoredDocument.Type;
const DocumentJson = Schema.fromJsonString(StoredDocument);

export const shouldRetryDocument = (document: StoredDocument): boolean =>
  (document.retryCount ?? 0) < 3 &&
  document.coverage.parts.some((part) => {
    if (part.status === "full") return false;
    const detail = part.detail ?? "";
    if (/failed or capped pages:/iu.test(detail)) {
      const failed = detail.split(";")[0]?.match(/\d+/gu) ?? [];
      const capped = new Set(detail.split("; capped:")[1]?.match(/\d+/gu) ?? []);
      return failed.some((page) => !capped.has(page));
    }
    return /fail|error|timeout|unavailable/iu.test(detail);
  });

/** Retry useful partial content automatically, with bounded exponential backoff. */
export const extractionRetryMinutes = (document: StoredDocument): number | undefined =>
  shouldRetryDocument(document) ? 2 ** ((document.retryCount ?? 0) + 1) : undefined;

/** Keep recovered sections and previously successful parts if a retry has another transient loss. */
export const mergeExtractionRetry = (
  previous: StoredDocument,
  fresh: ExtractedDocument,
): ExtractedDocument => {
  if (fresh.coverage.status === "full") return fresh;
  const key = (section: ExtractedDocument["sections"][number]) =>
    JSON.stringify([section.kind, section.location]);
  const locations = new Set(fresh.sections.map(key));
  return {
    ...fresh,
    sections: [
      ...fresh.sections,
      ...previous.sections.filter((section) => !locations.has(key(section))),
    ],
  };
};
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * The key of the stored document, when the file's recorded document was extracted from exactly
 * these bytes by this extractor. The database is the only source: nothing is looked up in storage.
 */
export const reusableDocumentKey = (
  found: {
    readonly contentHash: string | null;
    readonly documentKey: string | null;
    readonly extractorVersion: number | null;
  },
  contentHash: string | null,
): StorageKey | null =>
  contentHash !== null &&
  found.contentHash === contentHash &&
  found.extractorVersion === EXTRACTOR_VERSION &&
  found.documentKey !== null
    ? (found.documentKey as StorageKey)
    : null;

/** The stored document at `key`, or none when it's missing or no longer decodes. */
export const loadDocument = Effect.fn("Document.load")(function* (key: StorageKey) {
  const storage = yield* Storage;
  return yield* storage.get(key).pipe(
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

/** Writes the document to a brand-new key and returns it; the caller records it on the file. */
export const saveDocument = Effect.fn("Document.save")(function* (
  userId: UserId,
  fileId: FileId,
  document: StoredDocument,
) {
  const storage = yield* Storage;
  const json = yield* Schema.encodeEffect(DocumentJson)(document).pipe(Effect.orDie);
  const body = yield* Effect.promise(() => gzipAsync(json));
  const key = fileDocumentKey(userId, fileId, EXTRACTOR_VERSION, yield* newKeyVersion);
  yield* storage.put(key, body, { contentType: "application/gzip" });
  return key;
});

/** Drops a document the file no longer points at. Best effort: an orphan only costs space. */
export const removeDocument = (key: StorageKey) =>
  Effect.flatMap(Effect.service(Storage), (storage) => storage.remove(key)).pipe(
    Effect.catchTag("StorageError", (error) =>
      Effect.logWarning("Could not remove superseded document", error),
    ),
  );
