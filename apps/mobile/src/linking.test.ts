import { describe, expect, it } from "vite-plus/test";
import { citationPage, citationTime, fileIds } from "./linking";

describe("mobile deep-link parameters", () => {
  it("keeps citation pages and fractional video times numeric", () => {
    expect(citationPage("12")).toBe(12);
    expect(citationTime("83.5")).toBe(83.5);
  });
  it("normalizes malformed and negative positions", () => {
    for (const value of ["NaN", "Infinity", "-3", ""]) {
      expect(citationPage(value)).toBe(1);
      expect(citationTime(value)).toBe(0);
    }
    expect(citationPage("4.8")).toBe(4);
  });
  it("parses selections as file IDs rather than individual characters", () => {
    expect(fileIds("file-one,file-two")).toEqual(["file-one", "file-two"]);
    expect(fileIds("")).toEqual([]);
  });
});
