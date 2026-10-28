import { FileId, FolderId } from "@avenire/contracts";
import { describe, expect, it } from "@effect/vitest";

import { composeSuggestions } from "./filingSuggestions.ts";

const a = FolderId.make("a");
const b = FolderId.make("b");
const context = {
  fileId: FileId.make("file"),
  title: "Item",
  kind: "pdf",
  contentHash: "hash",
  excerpt: "",
  ranked: [
    { folderId: a, similarity: 0.5 },
    { folderId: b, similarity: 0.44 },
  ],
  candidates: [],
};

describe("composeSuggestions", () => {
  it("leads with the judge's pick and keeps the other matches after it", () => {
    expect(composeSuggestions(context, { folderId: b, newNotebook: null })).toEqual({
      fileId: "file",
      suggestions: [
        { folderId: b, similarity: 0.44 },
        { folderId: a, similarity: 0.5 },
      ],
      newNotebook: null,
    });
  });

  it("keeps confident matches next to the judge's new notebook when it finds no fit", () => {
    expect(composeSuggestions(context, { folderId: null, newNotebook: "Statistics" })).toEqual({
      fileId: "file",
      suggestions: context.ranked,
      newNotebook: "Statistics",
    });
  });

  it("falls back to embedding suggestions without a verdict", () => {
    expect(composeSuggestions({ ...context, ranked: [] }, null)).toEqual({
      fileId: "file",
      suggestions: [],
      newNotebook: null,
    });
  });
});
