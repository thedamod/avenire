import { FileId, UserId } from "@avenire/contracts";
import { StorageMemory } from "@avenire/storage/storage";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { loadDocument, saveDocument } from "./document.ts";
import type { ExtractedDocument } from "./extract/types.ts";

const userId = UserId.make("user");
const fileId = FileId.make("file");

const document: ExtractedDocument = {
  title: "Lecture 6",
  sections: [
    { text: "Singular values", location: { startSec: 555, endSec: 600 }, kind: "transcript" },
    { text: "SVD = U Σ Vᵀ", location: { slide: 4 }, kind: "slide" },
  ],
  coverage: { status: "partial", parts: [{ part: "slides", status: "partial", detail: "capped" }] },
};

it.effect("round-trips a document through storage", () =>
  Effect.gen(function* () {
    yield* saveDocument(userId, fileId, document);
    expect(yield* loadDocument(userId, fileId)).toEqual(Option.some(document));
  }).pipe(Effect.provide(StorageMemory)),
);

it.effect("treats a missing document as none", () =>
  Effect.gen(function* () {
    expect(Option.isNone(yield* loadDocument(userId, FileId.make("missing")))).toBe(true);
  }).pipe(Effect.provide(StorageMemory)),
);
