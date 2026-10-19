import { describe, expect, it } from "@effect/vitest";
import { getResolvedPDFJS } from "unpdf";

import { pageHasFigure } from "./pdf-figures.ts";

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
});
