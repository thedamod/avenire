import { describe, expect, it } from "@effect/vitest";

import { sectionsFromMarkdown } from "./markdown.ts";
import { extractTextDocument } from "./text.ts";
import type { SourceInput } from "./types.ts";

const source: SourceInput = {
  kind: "note",
  title: "Lecture notes",
  mimeType: "text/markdown",
  sourceUrl: null,
  bytes: null,
};

describe("markdown sections", () => {
  it("tracks nested headings and preserves unheaded introduction", () => {
    expect(sectionsFromMarkdown("Intro\n# One\nBody\n## Two\nDetails\n# Three\nEnd")).toEqual([
      { text: "Intro", location: {} },
      { text: "Body", location: { heading: "One" } },
      { text: "Details", location: { heading: "One › Two" } },
      { text: "End", location: { heading: "Three" } },
    ]);
  });

  it("applies heading locations to notes", () => {
    const result = extractTextDocument(new TextEncoder().encode("# Topic\nExplanation"), source);
    expect(result.title).toBe("Lecture notes");
    expect(result.sections).toEqual([{ text: "Explanation", location: { heading: "Topic" } }]);
  });
});
