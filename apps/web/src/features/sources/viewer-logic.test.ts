import { describe, expect, it } from "vite-plus/test";
import {
  ZOOM_RANGE,
  citationQueries,
  clampPan,
  clampZoom,
  findInItems,
  highlightText,
  markRanges,
  pageWindow,
  parsePageInput,
  parseZoomInput,
  safePixelRatio,
  stepZoom,
} from "./viewer-logic";
import { parseCitation } from "./citation";
describe("viewer boundaries", () => {
  it("clamps invalid and extreme zoom requests", () => {
    expect(clampZoom(Infinity)).toBe(0.5);
    expect(clampZoom(-2)).toBe(0.5);
    expect(clampZoom(9)).toBe(3);
    expect(clampZoom(1.25)).toBe(1.25);
  });
  it("steps zoom on the grid and stops at the range ends", () => {
    expect(stepZoom(1, 1, ZOOM_RANGE.pdf)).toBe(1.1);
    expect(stepZoom(0.95, 1, ZOOM_RANGE.pdf)).toBe(1);
    expect(stepZoom(1.03, -1, ZOOM_RANGE.pdf)).toBe(1);
    expect(stepZoom(0.1, -1, ZOOM_RANGE.pdf)).toBe(0.1);
    expect(stepZoom(5, 1, ZOOM_RANGE.pdf)).toBe(5);
    expect(stepZoom(1, 1, ZOOM_RANGE.image)).toBe(1.25);
  });
  it("parses typed zoom percentages and page numbers", () => {
    expect(parseZoomInput("125", ZOOM_RANGE.pdf)).toBe(1.25);
    expect(parseZoomInput("80%", ZOOM_RANGE.pdf)).toBe(0.8);
    expect(parseZoomInput("9000", ZOOM_RANGE.pdf)).toBe(5);
    expect(parseZoomInput("1", ZOOM_RANGE.pdf)).toBe(0.1);
    expect(parseZoomInput("50", ZOOM_RANGE.image)).toBe(1);
    expect(parseZoomInput("", ZOOM_RANGE.pdf)).toBeNull();
    expect(parseZoomInput("abc", ZOOM_RANGE.pdf)).toBeNull();
    expect(parsePageInput("7", 12)).toBe(7);
    expect(parsePageInput("99", 12)).toBe(12);
    expect(parsePageInput("0", 12)).toBeNull();
    expect(parsePageInput("", 12)).toBeNull();
  });
  it("keeps panning inside actual image bounds", () => {
    expect(clampPan(500, 400, 600, 2)).toBe(100);
    expect(clampPan(-500, 400, 600, 2)).toBe(-100);
    expect(clampPan(50, 200, 600, 2)).toBe(0);
  });
  it("bounds the page window at both document edges", () => {
    expect(pageWindow(1, 24)).toEqual({ start: 1, end: 3 });
    expect(pageWindow(24, 24)).toEqual({ start: 22, end: 24 });
    expect(pageWindow(12, 24)).toEqual({ start: 10, end: 14 });
  });
  it("lowers the canvas pixel ratio only for huge pages", () => {
    expect(safePixelRatio(2, 800, 1000)).toBe(2);
    expect(safePixelRatio(2, 3800, 4900)).toBeLessThan(1);
    // Poster-size pages stay under the canvas budget instead of flooring at 0.5.
    const poster = safePixelRatio(2, 20_000, 30_000);
    expect(20_000 * 30_000 * poster ** 2).toBeLessThanOrEqual(16e6 + 1);
    expect(safePixelRatio(Number.NaN, 100, 100)).toBe(1);
  });
  it("escapes PDF text and search patterns before inserting highlights", () => {
    expect(highlightText("<img src=x> a+b", "a+b")).toBe("&#60;img src=x&#62; <mark>a+b</mark>");
    expect(highlightText("&amp;", "&")).toBe("<mark>&#38;</mark>amp;");
  });
  it("finds a cited passage across PDF.js text items and hyphenated line breaks", () => {
    const items = ["The second law of thermo-", "dynamics states that", " entropy grows."];
    const [needle] = citationQueries("law of thermodynamics  states");
    const ranges = findInItems(items, needle!);
    expect(ranges?.get(0)).toEqual([[11, 24]]);
    expect(ranges?.get(1)).toEqual([[0, 15]]);
    expect(markRanges(items[1]!, ranges?.get(1))).toBe("<mark>dynamics states</mark> that");
    expect(findInItems(items, "absent")).toBeNull();
  });
  it("offers shorter fallbacks for long citations", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const queries = citationQueries(long);
    expect(queries[0]).toBe(long.replaceAll(" ", ""));
    expect(queries.at(-1)).toBe("word0word1word2word3word4word5");
    expect(citationQueries("   ")).toEqual([]);
  });
  it("preserves citation targets and rejects invalid page/time", () => {
    expect(parseCitation(new URLSearchParams("page=8&t=0&q=heat&region=.8,.7,.5,.5"))).toEqual({
      page: 8,
      t: 0,
      q: "heat",
      region: { x: 0.8, y: 0.7, w: 1 - 0.8, h: 1 - 0.7 },
    });
    expect(parseCitation(new URLSearchParams("page=NaN&t=-1"))).toEqual({});
  });
});
