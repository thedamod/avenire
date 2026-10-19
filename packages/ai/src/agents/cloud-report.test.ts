import { describe, expect, it } from "@effect/vitest";
import { FileId } from "@avenire/contracts";
import { buildReport, type ReportInput } from "./cloud-report.ts";

const file = {
  fileId: FileId.make("source-id"),
  drivePath: "Physics/Lecture.pdf",
  sandboxPath: "/inputs/lecture.pdf",
  reason: "edited today",
  size: 10,
  hash: "hash",
  skipped: false,
};
const input: ReportInput = {
  run: {
    id: "run",
    status: "failed",
    startedAt: new Date("2026-10-09T03:00:00Z"),
    finishedAt: new Date("2026-10-09T03:10:00Z"),
    scheduledFor: new Date("2026-10-09T03:00:00Z"),
    attempt: 2,
  },
  task: { title: "Study digest", timeZone: "UTC" },
  hydrations: [{ files: [file] }, { files: [file] }],
  produced: [{ id: "output", title: "Study notes" }],
  approvals: [
    {
      fileTitle: "Lecture",
      summary: "Copy corrected",
      conflict: "Original changed since hydration",
    },
  ],
  recording: { id: "video", url: "https://app.example.test/a/video-token" },
  summary: "I created study notes.",
  appUrl: "https://app.example.test/",
  error: "A quiz could not be completed.",
  hydrationFailures: ["One source could not be downloaded"],
};
describe("buildReport", () => {
  it("uses audited deduplicated inputs and links outputs, conflicts, recording and failures", () => {
    const report = buildReport(input);
    expect(report).toContain("Status: failed · attempt 2");
    expect(report).toContain("2026-10-09T03:10:00.000Z");
    expect(report).toContain("I created study notes.");
    expect(report.match(/library\?file=source-id/g)).toHaveLength(1);
    expect(report).toContain("https://app.example.test/library?file=output");
    expect(report).toContain("1 changes wait for your review");
    expect(report).toContain("https://app.example.test/cloud/review?run=run");
    expect(report).toContain("Lecture: Copy corrected");
    expect(report).toContain("Conflict: Original changed since hydration");
    expect(report).toContain("https://app.example.test/a/video-token");
    expect(report).toContain("A quiz could not be completed");
    expect(report).toContain("One source could not be downloaded");
  });
  it("escapes source labels so filenames cannot break their links", () => {
    expect(
      buildReport({ ...input, produced: [{ id: "safe", title: "[title](other)" }] }),
    ).toContain("\\[title\\](other)");
  });
});
