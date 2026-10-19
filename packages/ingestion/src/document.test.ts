import { FileId, StorageKey, UserId } from "@avenire/contracts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { randomBytes } from "node:crypto";

import {
  loadDocument,
  removeDocument,
  reusableDocumentKey,
  saveDocument,
  shouldRetryDocument,
  extractionRetryMinutes,
  mergeExtractionRetry,
} from "./document.ts";
import { EXTRACTOR_VERSION, type ExtractedDocument } from "./extract/types.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");
const crypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(randomBytes(size)),
  digest: () => Effect.die("unused"),
});

const document: ExtractedDocument = {
  title: "Lecture 6",
  sections: [
    { text: "Singular values", location: { startSec: 555, endSec: 600 }, kind: "transcript" },
    { text: "SVD = U Σ Vᵀ", location: { slide: 4 }, kind: "slide" },
  ],
  coverage: { status: "partial", parts: [{ part: "slides", status: "partial", detail: "capped" }] },
};

it.effect("every save is a new key, the file's recorded key is the only one read", () =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const first = yield* saveDocument(userId, fileId, document);
    const second = yield* saveDocument(userId, fileId, document);
    expect(second).not.toBe(first);
    expect(yield* loadDocument(second)).toEqual(Option.some(document));

    yield* removeDocument(first);
    expect((yield* storage.list(StorageKey.make("users/user/"))).map((o) => o.key)).toEqual([
      second,
    ]);
    // A missing document degrades to a fresh extraction rather than failing.
    expect(Option.isNone(yield* loadDocument(first))).toBe(true);
  }).pipe(Effect.provide(StorageMemory), Effect.provideService(Crypto.Crypto, crypto)),
);

it("reuses a document only for the recorded bytes and extractor version", () => {
  const found = {
    contentHash: "abc",
    documentKey: "users/user/doc",
    extractorVersion: EXTRACTOR_VERSION,
  };
  expect(reusableDocumentKey(found, "abc")).toBe("users/user/doc");
  expect(reusableDocumentKey(found, "changed")).toBeNull();
  expect(
    reusableDocumentKey({ ...found, extractorVersion: EXTRACTOR_VERSION - 1 }, "abc"),
  ).toBeNull();
  expect(reusableDocumentKey({ ...found, documentKey: null }, "abc")).toBeNull();
  expect(reusableDocumentKey(found, null)).toBeNull();
});

it("retries transient partial work three times while leaving intentional caps reusable", () => {
  const partial = {
    ...document,
    coverage: {
      status: "partial" as const,
      parts: [
        {
          part: "ocr",
          status: "partial" as const,
          detail: "Failed or capped pages: 2, 151; capped: 151",
        },
      ],
    },
  };
  expect(shouldRetryDocument(partial)).toBe(true);
  expect(
    [0, 1, 2, 3].map((retryCount) => extractionRetryMinutes({ ...partial, retryCount })),
  ).toEqual([2, 4, 8, undefined]);
  expect(extractionRetryMinutes(document)).toBeUndefined();
  expect(shouldRetryDocument({ ...partial, retryCount: 2 })).toBe(true);
  expect(shouldRetryDocument({ ...partial, retryCount: 3 })).toBe(false);
  expect(
    shouldRetryDocument({
      ...partial,
      coverage: {
        status: "partial",
        parts: [
          { part: "ocr", status: "partial", detail: "Failed or capped pages: 151; capped: 151" },
        ],
      },
    }),
  ).toBe(false);
  expect(shouldRetryDocument(document)).toBe(false);
});

it("retains recovered sections through another partial retry and replaces them on full recovery", () => {
  const previous = {
    ...document,
    sections: [
      { text: "Page one", location: { page: 1 } },
      { text: "Page two", location: { page: 2 } },
    ],
  };
  const fresh = {
    ...document,
    sections: [{ text: "Recovered page three", location: { page: 3 } }],
  };
  expect(mergeExtractionRetry(previous, fresh).sections.map((section) => section.text)).toEqual([
    "Recovered page three",
    "Page one",
    "Page two",
  ]);
  const recovered = {
    ...fresh,
    coverage: { status: "full" as const, parts: [{ part: "ocr", status: "full" as const }] },
  };
  expect(mergeExtractionRetry(previous, recovered)).toEqual(recovered);
});
