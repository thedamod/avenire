import { describe, expect, it } from "@effect/vitest";
import { readFile } from "node:fs/promises";

import { describeSkills, loadSkills } from "./index.ts";
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

  it("describe themselves for the prompt catalog", () => {
    expect(describeSkills(["sandbox"])).toMatch(/^- `sandbox`: Use sandbox tools/);
  });
});
