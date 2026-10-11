import { describe, expect, it } from "vite-plus/test";
import { boxCorners, figureSvg, fitProjection, iso, slabOf, solidSvg } from "./iso.ts";

describe("isometric browser runtime", () => {
  it("projects and renders a labeled solid without DOM globals", () => {
    const plan = { x: 0, y: 0, w: 60, d: 40, r: 4 };
    const p = fitProjection(boxCorners(plan, 0, 10), 320, 220);
    expect(iso([0, 0, 0], p)).toHaveLength(2);
    const body = solidSvg(slabOf(plan, 0, 10, p));
    const svg = figureSvg({ width: 320, height: 220, label: "Block", body });
    expect(svg).toContain("Block");
    expect(svg).toContain("<path");
  });
});
