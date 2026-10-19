import { describe, expect, it } from "@effect/vitest";

import { chunkSections } from "./chunk.ts";
import { planChunkDiff } from "./indexer.ts";

const incoming = (texts: ReadonlyArray<string>) =>
  chunkSections(texts.map((text) => ({ text, location: {} }))).map((chunk) => ({
    ...chunk,
    contentHash: chunk.content,
    contentNorm: chunk.content,
    text: chunk.content,
  }));

const existing = (
  id: string,
  contentHash: string,
  ordinal: number,
  embeddingModel = "model-v1",
) => ({
  id,
  contentHash,
  ordinal,
  embeddingModel,
  kind: "concept" as const,
  location: {},
  content: contentHash,
  graphIndexed: true,
});

describe("planChunkDiff", () => {
  it("leaves an unchanged row out of all write sets", () => {
    const diff = planChunkDiff([existing("a", "same", 0)], incoming(["same"]), "model-v1");
    expect(diff.kept).toHaveLength(1);
    expect(diff.moved).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);
  });

  it("keeps matching rows once and detects reorder", () => {
    const diff = planChunkDiff(
      [existing("a", "first", 0), existing("b", "second", 1)],
      incoming(["second", "first"]),
      "model-v1",
    );
    expect(diff.kept.map((row) => row.id)).toEqual(["b", "a"]);
    expect(diff.moved).toHaveLength(2);
    expect(diff.added).toHaveLength(0);
    expect(diff.deleted).toHaveLength(0);
  });

  it("matches duplicate hashes as a multiset", () => {
    const diff = planChunkDiff(
      [existing("a", "same", 0), existing("b", "same", 1)],
      incoming(["same", "same", "same"]),
      "model-v1",
    );
    expect(diff.kept.map((row) => row.id)).toEqual(["a", "b"]);
    expect(diff.added).toHaveLength(1);
    expect(diff.deleted).toHaveLength(0);
  });

  it("replaces rows from another embedding model", () => {
    const diff = planChunkDiff(
      [existing("old", "same", 0, "model-v0")],
      incoming(["same"]),
      "model-v1",
    );
    expect(diff.kept).toHaveLength(0);
    expect(diff.added).toHaveLength(1);
    expect(diff.deleted.map((row) => row.id)).toEqual(["old"]);
  });
});
