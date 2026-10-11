import { describe, expect, it } from "@effect/vitest";
import { FileId } from "@avenire/contracts";
import { buildReport, type ReportInput } from "./cloud-report.ts";
import { parsePiLogs, piCommand } from "./cloud-pi.ts";

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
  recording: { id: "video" },
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
    expect(report).toContain("https://app.example.test/artifacts/video");
    expect(report).toContain("A quiz could not be completed");
    expect(report).toContain("One source could not be downloaded");
  });
  it("escapes source labels so filenames cannot break their links", () => {
    expect(
      buildReport({ ...input, produced: [{ id: "safe", title: "[title](other)" }] }),
    ).toContain("\\[title\\](other)");
  });
});
describe("Pi protocol", () => {
  it("reads final assistant text, including the agent_end fallback", () => {
    const logs = [
      "incomplete tail {",
      '{"type":"agent_start"}',
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "private" },
            { type: "text", text: "Earlier" },
          ],
        },
      }),
      JSON.stringify({
        type: "agent_end",
        messages: [{ role: "assistant", content: [{ type: "text", text: "Final" }] }],
      }),
    ].join("\n");
    expect(parsePiLogs(logs)).toEqual({ assistantText: "Final", started: true, error: null });
  });
  it("detects provider failure events without mistaking a tool error for an agent failure", () => {
    expect(
      parsePiLogs(
        JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: [],
            stopReason: "error",
            errorMessage: "provider failed",
          },
        }),
      ).error,
    ).toBe("provider failed");
    expect(parsePiLogs('{"type":"tool_execution_end","isError":true}').error).toBeNull();
  });
  it("a successful retry clears an earlier provider error", () => {
    const logs = [
      JSON.stringify({
        type: "message_end",
        message: { role: "assistant", content: [], stopReason: "error", errorMessage: "transient" },
      }),
      JSON.stringify({ type: "auto_retry_end", success: true }),
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "stop",
          content: [{ type: "text", text: "Recovered" }],
        },
      }),
    ].join("\n");
    expect(parsePiLogs(logs)).toEqual({ assistantText: "Recovered", started: true, error: null });
  });
  it("quotes model arguments and uses only documented unattended options", () => {
    const command = piCommand("run", "model' $(touch /tmp/injection)");
    expect(command).toContain(
      "PI_TELEMETRY=0 pi -p --mode json --no-session --offline --no-approve",
    );
    expect(command).toContain("--extension /home/daytona/.avenire/pi/avenire.ts");
    expect(command).toContain("'@/home/daytona/workspace/runs/run/prompt.md'");
    expect(command).toContain("'model'\\'' $(touch /tmp/injection)'");
  });
});
