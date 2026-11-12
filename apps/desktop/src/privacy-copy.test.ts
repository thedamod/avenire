import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
it("privacy policy distinguishes source protections from optional whole-display sharing", () => {
  const policy = readFileSync(
    new URL("../../marketing/src/content/legal/privacy.md", import.meta.url),
    "utf8",
  );
  expect(policy).toContain("updated: 2026-11-12");
  expect(policy).toContain("Settings → Capture");
  expect(policy).toContain("off by default");
  expect(policy).toContain("Source-saving filters do not filter whole-display images");
  expect(policy).toContain("not saved or sent to AI providers");
  expect(policy).toContain("rather than persisted as canonical chat messages or library files");
  expect(policy).not.toContain("### What we never capture");
  expect(policy).not.toContain("It doesn't take screenshots");
});
