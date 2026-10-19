import { FileId, StorageKey, UserId } from "@avenire/contracts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { randomBytes } from "node:crypto";

import { loadDocument, removeDocument, reusableDocumentKey, saveDocument } from "./document.ts";
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
