import { describe, expect, it } from "vite-plus/test";
import { currentRailItem, railIndexAtPointer, timelineRailItems } from "./timelineRail.ts";
import type { ChatRow } from "./types.ts";

const user = (id: string, text: string): ChatRow => ({
  kind: "user",
  id,
  messageId: id,
  text,
  attachments: [],
  sig: "",
});
const prose = (id: string, text: string): ChatRow => ({
  kind: "prose",
  id,
  messageId: id,
  text,
  streaming: false,
});

describe("timeline rail", () => {
  it("indexes user turns and keeps the final answer with its own turn", () => {
    const items = timelineRailItems(
      [
        user("u1", "Entropy?"),
        prose("a1", "Let me check"),
        prose("a2", "Final answer"),
        user("u2", "And heat?"),
        prose("a3", "Heat answer"),
      ],
      false,
    );
    expect(items).toEqual([
      { id: "u1", rowIndex: 0, title: "Entropy?", preview: "Final answer" },
      { id: "u2", rowIndex: 3, title: "And heat?", preview: "Heat answer" },
    ]);
    expect(currentRailItem(items, 2)).toBe("u1");
    expect(currentRailItem(items, 4)).toBe("u2");
  });

  it("includes report sections before follow-up turns without turning their answers into sections", () => {
    const items = timelineRailItems(
      [
        prose("report", "# Heat engines\nSummary"),
        user("u1", "Explain this"),
        prose("a1", "Explanation"),
      ],
      true,
    );
    expect(items.map(({ id, rowIndex, title }) => ({ id, rowIndex, title }))).toEqual([
      { id: "report-intro", rowIndex: -1, title: "Morning report" },
      { id: "report", rowIndex: 0, title: "Heat engines" },
      { id: "u1", rowIndex: 1, title: "Explain this" },
    ]);
    expect(items[2]?.preview).toBe("Explanation");
  });

  it("clamps pointer navigation to the rail, including a degenerate rail", () => {
    expect(railIndexAtPointer(0, 100, 100, 5)).toBe(0);
    expect(railIndexAtPointer(150, 100, 100, 5)).toBe(2);
    expect(railIndexAtPointer(300, 100, 100, 5)).toBe(4);
    expect(railIndexAtPointer(150, 100, 0, 1)).toBe(0);
  });
});
