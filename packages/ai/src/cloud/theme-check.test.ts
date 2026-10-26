import { describe, expect, it } from "@effect/vitest";
import { colorLiterals, isCapture, markupViolations } from "./theme-check.ts";

describe("Cloud visual theme check", () => {
  it("normalises hex, rgb, hsl and named colour literals", () => {
    expect(
      colorLiterals(
        `.a{color:#0F7B6C;background:#fff8} .b{fill:rgb(98 217 204 / .5)} ctx.fillStyle = "hsl(30, 100%, 50%)"; el.style.color = 'teal'`,
      ),
    ).toEqual(["#0f7b6c", "#ffffff", "#62d9cc", "#ff8000", "teal"]);
  });
  it("ignores variables, entities and fragment links", () => {
    expect(
      colorLiterals(
        `<a href="#top">&#123;</a><style>.a{color:var(--figure-hi);border-color:rgb(from var(--figure-mid) r g b)}</style>`,
      ),
    ).toEqual([]);
  });
  it("lets HTML use only black, white and transparent; SVG may use palette values", () => {
    const html = `<style>.p{background:#0f1823;color:#fbfbfa;box-shadow:0 1px #0000000a}</style>`;
    expect(markupViolations("lab.html", html)).toEqual(["#0f1823", "#fbfbfa"]);
    expect(markupViolations("figure.svg", `<rect fill="#fbfbfa" stroke="#26262a"/>`)).toEqual([]);
    expect(markupViolations("figure.svg", `<path stroke="#ffb16d"/>`)).toEqual(["#ffb16d"]);
  });
  it("exempts files under a captures folder", () => {
    expect(isCapture("/home/daytona/workspace/runs/r/out/captures/screen.png")).toBe(true);
    expect(isCapture("/home/daytona/workspace/runs/r/out/plot.png")).toBe(false);
  });
});
