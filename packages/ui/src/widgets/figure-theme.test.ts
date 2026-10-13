import { expect, it } from "@effect/vitest";
import { readFileSync } from "node:fs";
import { adaptFigureTheme } from "./figure-theme.ts";

it("adapts real pinned shader sources without changing standalone source files", () => {
  const source = (name: string) =>
    readFileSync(
      new URL(`../../../cloud/assets/figures/examples/${name}/live.js`, import.meta.url),
      "utf8",
    );
  for (const name of ["raptor-engine", "turning-dial", "ripple-tank"]) {
    const original = source(name);
    const adapted = adaptFigureTheme(
      `<style>--figure-page</style><script type="module">${original}</script>`,
    );
    expect(adapted).toContain('window.addEventListener("avenire:themechange"');
    expect(adapted).toContain(name === "ripple-tank" ? "let pale =" : "let LIGHT =");
    expect(source(name)).toBe(original);
    if (name === "ripple-tank") expect(adapted).toContain("paperLayer?.set(avenireFixed())");
  }
  expect(adaptFigureTheme("<p>Normal chart</p>")).toBe("<p>Normal chart</p>");
});
