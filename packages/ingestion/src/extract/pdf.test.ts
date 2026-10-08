import { describe, expect, it } from "@effect/vitest";
import { PDFDocument } from "pdf-lib";
import { getResolvedPDFJS } from "unpdf";

import { remapFallbackPages, subsetPdfPages } from "./ocr.ts";
import { assemblePdfDocument, mergePageText, pageHasFigure, pageNeedsOcr } from "./pdf.ts";

const { OPS } = await getResolvedPDFJS();
const viewport = { width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0] };

const operators = (entries: ReadonlyArray<readonly [number, unknown]>) => ({
  fnArray: entries.map(([op]) => op),
  argsArray: entries.map(([, args]) => args),
});

describe("PDF extraction decisions", () => {
  it("uses drawn image size, not source pixel count", () => {
    const logo = operators([
      [OPS.save, []],
      [OPS.transform, [30, 0, 0, 30, 20, 700]],
      [OPS.paintImageXObject, ["logo", 2000, 2000]],
      [OPS.restore, []],
    ]);
    const chart = operators([
      [OPS.save, []],
      [OPS.transform, [200, 0, 0, 120, 90, 300]],
      [OPS.paintImageXObject, ["chart", 20, 10]],
      [OPS.restore, []],
    ]);
    expect(pageHasFigure(logo, viewport, OPS)).toBe(false);
    expect(pageHasFigure(chart, viewport, OPS)).toBe(true);
  });

  it("recognizes repeated and grouped images by their individual drawn bounds", () => {
    const repeated = operators([
      [OPS.paintImageXObjectRepeat, ["chart", 200, 120, new Float32Array([100, 200])]],
    ]);
    const grouped = operators([
      [
        OPS.paintInlineImageXObjectGroup,
        [{ width: 20, height: 10 }, [{ transform: [200, 0, 0, 120, 100, 200] }]],
      ],
    ]);
    expect(pageHasFigure(repeated, viewport, OPS)).toBe(true);
    expect(pageHasFigure(grouped, viewport, OPS)).toBe(true);
  });

  it("recognizes a row of figure tiles but skips a row of icons", () => {
    const row = (size: number) =>
      operators(
        Array.from(
          { length: 5 },
          (_, index) =>
            [
              [OPS.save, []],
              [OPS.transform, [size, 0, 0, size, 50 + index * (size + 3), 300]],
              [OPS.paintImageXObject, [`image-${index}`, 256, 256]],
              [OPS.restore, []],
            ] as const,
        ).flat(),
      );
    expect(pageHasFigure(row(75), viewport, OPS)).toBe(true);
    expect(pageHasFigure(row(20), viewport, OPS)).toBe(false);
  });

  it("recognizes a small plotted image with vector axes but skips a plain portrait", () => {
    const portrait = operators([
      [OPS.save, []],
      [OPS.transform, [90, 0, 0, 90, 100, 300]],
      [OPS.paintImageXObject, ["portrait", 900, 900]],
      [OPS.restore, []],
    ]);
    const plot = operators([
      ...Array.from(
        { length: 2 },
        (_, index) =>
          [
            [
              OPS.constructPath,
              [OPS.stroke, new Float32Array(), new Float32Array([100 + index * 5, 300, 190, 390])],
            ],
          ] as const,
      ).flat(),
      ...portrait.fnArray.map((op, index) => [op, portrait.argsArray[index]] as const),
    ]);
    expect(pageHasFigure(portrait, viewport, OPS)).toBe(false);
    expect(pageHasFigure(plot, viewport, OPS)).toBe(true);
  });

  it("recognizes dense vector heatmaps with or without a raster colorbar", () => {
    const pixels = Array.from(
      { length: 2000 },
      (_, index) =>
        [
          OPS.constructPath,
          [
            OPS.fill,
            new Float32Array(),
            new Float32Array([
              (index % 50) * 3,
              Math.floor(index / 50) * 3,
              (index % 50) * 3 + 2,
              Math.floor(index / 50) * 3 + 2,
            ]),
          ],
        ] as const,
    );
    const heatmap = operators([
      ...pixels,
      [OPS.save, []],
      [OPS.transform, [10, 0, 0, 120, 300, 200]],
      [OPS.paintImageXObject, ["colorbar", 50, 600]],
      [OPS.restore, []],
    ]);
    expect(pageHasFigure(heatmap, viewport, OPS)).toBe(true);
    expect(pageHasFigure(operators(pixels), viewport, OPS)).toBe(true);
  });

  it("recognizes a bar chart made of many narrow vector paths", () => {
    const bars = operators([
      ...Array.from(
        { length: 500 },
        (_, index) =>
          [
            OPS.constructPath,
            [
              OPS.fill,
              new Float32Array(),
              new Float32Array([
                100 + (index % 100) * 3,
                200,
                102 + (index % 100) * 3,
                210 + Math.floor(index / 100) * 10,
              ]),
            ],
          ] as const,
      ),
      ...Array.from(
        { length: 3 },
        (_, index) =>
          [
            OPS.constructPath,
            [
              OPS.stroke,
              new Float32Array(),
              new Float32Array([100 + index * 120, 190, 180 + index * 120, 260]),
            ],
          ] as const,
      ),
    ]);
    expect(pageHasFigure(bars, viewport, OPS)).toBe(true);
  });

  it("recognizes a small chart of tall bars without a wide frame", () => {
    const bars = operators(
      Array.from(
        { length: 12 },
        (_, index) =>
          [
            [OPS.save, []],
            [OPS.transform, [1, 0, 0, 1, 100 + index * 30, 200]],
            [
              OPS.constructPath,
              [OPS.fill, new Float32Array(), new Float32Array([0, 0, 20, 45 + (index % 3) * 15])],
            ],
            [OPS.restore, []],
          ] as const,
      ).flat(),
    );
    expect(pageHasFigure(bars, viewport, OPS)).toBe(true);
  });

  it("recognizes a substantial vector diagram but skips table rules and callout borders", () => {
    const diagram = operators(
      Array.from(
        { length: 12 },
        (_, index) =>
          [
            [OPS.save, []],
            [OPS.transform, [1, 0, 0, 1, 100 + (index % 4) * 48, 200 + Math.floor(index / 4) * 48]],
            [OPS.constructPath, [OPS.fill, new Float32Array(), new Float32Array([0, 0, 35, 35])]],
            [OPS.restore, []],
          ] as const,
      ).flat(),
    );
    const table = operators(
      Array.from(
        { length: 25 },
        (_, index) =>
          [
            [OPS.save, []],
            [OPS.transform, [1, 0, 0, 1, 70, 100 + index * 12]],
            [OPS.constructPath, [OPS.stroke, new Float32Array(), new Float32Array([0, 0, 450, 1])]],
            [OPS.restore, []],
          ] as const,
      ).flat(),
    );
    const callout = operators(
      Array.from(
        { length: 20 },
        () =>
          [
            OPS.constructPath,
            [OPS.fill, new Float32Array(), new Float32Array([0, 0, 450, 300])],
          ] as const,
      ),
    );
    const coloredRows = operators(
      Array.from(
        { length: 20 },
        (_, index) =>
          [
            [OPS.save, []],
            [OPS.transform, [1, 0, 0, 1, 70, 100 + index * 25]],
            [OPS.constructPath, [OPS.fill, new Float32Array(), new Float32Array([0, 0, 400, 20])]],
            [OPS.restore, []],
          ] as const,
      ).flat(),
    );
    const coloredCells = operators(
      Array.from(
        { length: 100 },
        (_, index) =>
          [
            [OPS.save, []],
            [
              OPS.transform,
              [1, 0, 0, 1, 70 + (index % 10) * 30, 100 + Math.floor(index / 10) * 45],
            ],
            [OPS.constructPath, [OPS.fill, new Float32Array(), new Float32Array([0, 0, 20, 40])]],
            [OPS.restore, []],
          ] as const,
      ).flat(),
    );
    expect(pageHasFigure(diagram, viewport, OPS)).toBe(true);
    expect(pageHasFigure(table, viewport, OPS)).toBe(false);
    expect(pageHasFigure(callout, viewport, OPS)).toBe(false);
    expect(pageHasFigure(coloredRows, viewport, OPS)).toBe(false);
    expect(pageHasFigure(coloredCells, viewport, OPS)).toBe(false);
  });

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
