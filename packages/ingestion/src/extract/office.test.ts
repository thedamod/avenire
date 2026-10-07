import { describe, expect, it } from "@effect/vitest";

import { renderSheetRows, sectionsFromOfficeAst } from "./office.ts";

describe("office structure", () => {
  it("renders spreadsheet values with detected headers", () => {
    expect(
      renderSheetRows([
        ["Student", "Score"],
        ["Ada", "95"],
        ["Lin", "88"],
      ]),
    ).toEqual(["Student: Ada | Score: 95", "Student: Lin | Score: 88"]);
  });

  it("preserves slide number and speaker notes", () => {
    expect(
      sectionsFromOfficeAst(
        [
          {
            type: "slide",
            metadata: { slideNumber: 4 },
            text: "Architecture",
            notes: [{ type: "note", text: "Explain cache" }],
          },
        ],
        "pptx",
      ),
    ).toEqual([{ text: "Architecture\n\nExplain cache", location: { slide: 4 }, kind: "slide" }]);
  });

  it("preserves sheet names and splits long sheets", () => {
    const rows = Array.from({ length: 302 }, (_, index) => ({
      type: "row" as const,
      children: [{ type: "cell" as const, text: `value-${index}` }],
    }));
    const sections = sectionsFromOfficeAst(
      [{ type: "sheet", metadata: { sheetName: "Results" }, children: rows }],
      "xlsx",
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]?.location).toEqual({ sheet: "Results" });
    expect(sections[1]?.text).toContain("value-301");
  });

  it("splits document paragraphs by headings", () => {
    expect(
      sectionsFromOfficeAst(
        [
          { type: "heading", text: "Chapter", metadata: { level: 1 } },
          { type: "heading", text: "Topic", metadata: { level: 2 } },
          { type: "paragraph", text: "Discussion" },
        ],
        "docx",
      ),
    ).toEqual([{ text: "Discussion", location: { heading: "Chapter › Topic" } }]);
  });
});
