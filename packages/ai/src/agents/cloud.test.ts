import { expect, it } from "@effect/vitest";
import { cloudUsageSegments, reconcileRecording } from "./cloud.ts";
import { openRouterCost, pendingToolCalls } from "./cloud-loop.ts";

it("splits usage across UTC midnight", () => {
  expect(
    cloudUsageSegments(Date.parse("2026-10-11T23:59:00Z"), Date.parse("2026-10-12T00:01:00Z")),
  ).toEqual([
    { day: "2026-10-11", seconds: 60 },
    { day: "2026-10-12", seconds: 60 },
  ]);
});
it("reattaches a recording by persisted id or deterministic run name", () => {
  const recordings = [
    { id: "foreign", name: "other" },
    { id: "current", name: "ruth-run.mp4" },
  ];
  expect(reconcileRecording(recordings, "run", null)?.id).toBe("current");
  expect(reconcileRecording(recordings, "run", "foreign")?.id).toBe("foreign");
  expect(reconcileRecording(recordings, "missing", null)).toBeUndefined();
});
it("reconciles only unresolved calls and records actual OpenRouter cost", () => {
  expect(
    pendingToolCalls([
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "a", toolName: "hydrate_files", input: {} },
          { type: "tool-call", toolCallId: "b", toolName: "publish_output", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "a",
            toolName: "hydrate_files",
            output: { type: "text", value: "done" },
          },
        ],
      },
    ]).map((c) => c.toolCallId),
  ).toEqual(["b"]);
  expect(openRouterCost({ openrouter: { usage: { cost: 0.25 } } })).toBe(0.25);
  expect(openRouterCost({ cost: -1 })).toBe(0);
});
