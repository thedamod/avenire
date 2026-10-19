import { describe, expect, it } from "@effect/vitest";

import { afterSnippet, beforeSnippet, endsMidSentence, startsMidSentence } from "./context.ts";

describe("snippets", () => {
  it("drops the words chunk windows share", () => {
    expect(beforeSnippet("The matrix is symmetric so its", "so its eigenvalues are real.")).toBe(
      "The matrix is symmetric",
    );
    expect(afterSnippet("so its eigenvalues", "eigenvalues are real.")).toBe("are real.");
  });

  it("keeps whole words at the cut", () => {
    const previous = `${"word ".repeat(100)}tail end`;
    const snippet = beforeSnippet(previous, "next");
    expect(snippet.length).toBeLessThanOrEqual(240);
    expect(snippet.startsWith("word")).toBe(true);
    expect(snippet.endsWith("tail end")).toBe(true);
  });

  it("detects cuts mid-sentence", () => {
    expect(startsMidSentence("and then the proof")).toBe(true);
    expect(startsMidSentence("Then the proof")).toBe(false);
    expect(endsMidSentence("the proof follows")).toBe(true);
    expect(endsMidSentence("the proof follows.")).toBe(false);
  });
});
