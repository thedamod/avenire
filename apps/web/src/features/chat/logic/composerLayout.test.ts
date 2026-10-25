import { describe, expect, it } from "vite-plus/test";
import { nextComposerLayout } from "./composerLayout.ts";

const at = (contentWidth: number, text = "x") => ({ text, contentWidth, inlineWidth: 300 });

describe("nextComposerLayout", () => {
  it("stacks when the text would wrap at inline width or has a newline", () => {
    expect(nextComposerLayout("inline", at(299))).toBe("inline");
    expect(nextComposerLayout("inline", at(301))).toBe("stacked");
    expect(nextComposerLayout("inline", at(10, "a\nb"))).toBe("stacked");
  });

  it("unstacks only with the margin to spare, so the boundary never oscillates", () => {
    expect(nextComposerLayout("stacked", at(290))).toBe("stacked");
    expect(nextComposerLayout("stacked", at(277))).toBe("stacked");
    expect(nextComposerLayout("stacked", at(276))).toBe("inline");
    // Deleting one character at the boundary keeps the stacked layout.
    let layout = nextComposerLayout("inline", at(301));
    layout = nextComposerLayout(layout, at(299));
    expect(layout).toBe("stacked");
  });

  it("keeps the current layout before the composer has been measured", () => {
    expect(nextComposerLayout("stacked", { text: "x", contentWidth: 0, inlineWidth: 0 })).toBe(
      "stacked",
    );
  });
});
