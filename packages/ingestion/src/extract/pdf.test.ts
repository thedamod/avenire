import { describe, expect, it } from "@effect/vitest";
import { PDFDocument } from "pdf-lib";

import { remapFallbackPages, subsetPdfPages } from "./ocr.ts";
import { assemblePdfDocument, mergePageText, pageNeedsOcr } from "./pdf.ts";

describe("PDF extraction decisions", () => {
  it("sends only selected PDF pages and preserves their source numbers", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.addPage([310, 400]);
    source.addPage([320, 400]);
    const selected = await PDFDocument.load(await subsetPdfPages(await source.save(), [3, 1]));
    expect(selected.getPageCount()).toBe(2);
    expect(selected.getPage(0).getWidth()).toBe(320);
    expect(selected.getPage(1).getWidth()).toBe(300);
    expect(
      remapFallbackPages(
        [
          { page: 1, markdown: "third" },
          { page: 2, markdown: "first" },
          { page: 3, markdown: "ignored" },
        ],
        [3, 1],
      ),
    ).toEqual([
      { page: 3, markdown: "third" },
      { page: 1, markdown: "first" },
    ]);
  });

  it("OCRs scanned and image-bearing pages even when native text is long", () => {
    expect(pageNeedsOcr({ page: 1, text: "", hasFigure: false })).toBe(true);
    expect(pageNeedsOcr({ page: 2, text: "a".repeat(300), hasFigure: true })).toBe(true);
    expect(pageNeedsOcr({ page: 3, text: "a".repeat(300), hasFigure: false })).toBe(false);
  });

  it("keeps native text when OCR is shorter and appends figure and table text", () => {
    expect(mergePageText("Native text stays intact", "Figure 1: trend")).toBe(
      "Native text stays intact\n\nFigure 1: trend",
    );
    expect(mergePageText("Native", "# Heading\nLonger OCR body")).toBe(
      "# Heading\nLonger OCR body",
    );
  });

  it("retains page and heading locations and reports failed OCR and empty pages", () => {
    const result = assemblePdfDocument(
      [
        { page: 1, text: "", hasFigure: true },
        { page: 2, text: "", hasFigure: false },
      ],
      [{ page: 1, markdown: "# Method\nResult\nFigure img-1: a chart" }],
      [1, 2],
    );
    expect(result.sections).toContainEqual({
      text: "Result\nFigure img-1: a chart",
      location: { page: 1, heading: "Method" },
    });
    expect(result.sections).toContainEqual({
      text: "Figure img-1: a chart",
      location: { page: 1 },
      kind: "figure",
    });
    expect(result.coverage.parts).toEqual([
      { part: "text", status: "partial", detail: "Empty pages: 2" },
      { part: "ocr", status: "partial", detail: "Failed or capped pages: 2" },
    ]);
  });

  it("names capped pages in OCR coverage", () => {
    const result = assemblePdfDocument(
      [{ page: 151, text: "Native text", hasFigure: true }],
      [],
      [],
    );
    expect(result.coverage.parts[1]).toEqual({
      part: "ocr",
      status: "partial",
      detail: "Failed or capped pages: 151; capped: 151",
    });
  });
});
