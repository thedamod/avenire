import { describe, expect, it } from "@effect/vitest";
import { chunkSections } from "./chunk.ts";

describe("chunkSections", () => {
  it("keeps chunks within the hard token bound", () => {
    const chunks = chunkSections([
      { text: Array.from({ length: 1800 }, (_, i) => `word${i}`).join(" "), location: {} },
    ]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.tokenCount <= 420)).toBe(true);
  });

  it("does not merge across locations", () => {
    const chunks = chunkSections([
      { text: "First section.", location: { page: 1 } },
      { text: "Second section.", location: { page: 2 } },
    ]);
    expect(chunks.map((chunk) => chunk.location.page)).toEqual([1, 2]);
  });

  it("overlaps only when splitting oversized paragraphs", () => {
    const content = Array.from({ length: 1200 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkSections([{ text: content, location: {} }]);
    expect(chunks[0]?.content).toContain(chunks[1]?.content.split(" ").slice(0, 10).join(" "));
    expect(
      chunkSections([{ text: "small paragraph\n\nnext paragraph", location: {} }]),
    ).toHaveLength(1);
  });

  it("classifies common semantic roles", () => {
    const chunks = chunkSections([
      { text: "Proof. Therefore this follows.", location: {} },
      { text: "A vector space is defined as a set with operations.", location: {} },
      { text: "Example: x is useful.", location: {} },
      { text: "x = y\na = b\nc = d\ne = f", location: {} },
    ]);
    expect(chunks.map((chunk) => chunk.kind)).toEqual([
      "proof",
      "definition",
      "example",
      "derivation",
    ]);
  });
});
