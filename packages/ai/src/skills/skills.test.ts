import { describe, expect, it } from "@effect/vitest";
import { readFile } from "node:fs/promises";

import { describeSkills, loadSkills, AVAILABLE_SKILLS } from "./index.ts";
import { OUTPUT_FILE, renderSkillsModule } from "./scripts/generator.ts";

describe("skills", () => {
  it("are regenerated after every source change", async () => {
    expect(await readFile(OUTPUT_FILE, "utf8")).toBe(await renderSkillsModule());
  });

  it("load once each, in request order", () => {
    const content = loadSkills(["chart", "visuals", "chart"]);
    expect(content.indexOf("# Chart")).toBeLessThan(content.indexOf("# Visuals"));
    expect(content.match(/# Chart\n/g)).toHaveLength(1);
  });

  it("offers one combined interactive skill with direct and mechanism examples", () => {
    const content = loadSkills(["explainer"]);
    expect(content).toContain("Simple pendulum");
    expect(content).toContain("How an engine works");
    expect(content).toContain("rk4Step");
    expect(content).toContain("under about 50 words");
    expect(AVAILABLE_SKILLS).toContain("explainer");
  });
  it("describe themselves for the prompt catalog", () => {
    expect(describeSkills(["sandbox"])).toMatch(/^- `sandbox`: Use sandbox tools/);
  });
});
