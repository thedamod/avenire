import { describe, expect, it } from "vite-plus/test";
import { lookupEntry, toolEntry } from "./toolParts.ts";
import { combineRunActivity, groupWorkEntries } from "./workGroups.ts";
import { groupWorkEntries as mobileGroups } from "../../../../../mobile/src/features/chat/thread/workGroups.ts";
import type { ChatRow } from "./types.ts";

describe("grouped activity", () => {
  it("combines work from multiple report messages while preserving the report prose", () => {
    const entry = toolEntry({
      type: "tool-box_write",
      toolCallId: "w1",
      state: "output-available",
    });
    const rows: ChatRow[] = [
      { kind: "work", id: "w1", messageId: "a1", entries: [entry], sig: "1" },
      { kind: "prose", id: "p1", messageId: "a1", text: "Report", streaming: false },
      { kind: "work", id: "w2", messageId: "a2", entries: [{ ...entry, id: "w2" }], sig: "2" },
    ];
    const combined = combineRunActivity(rows);
    expect(combined.map((row) => row.kind)).toEqual(["work", "prose"]);
    expect(combined[0]?.kind === "work" && combined[0].entries).toHaveLength(2);
    expect(combined[1]).toBe(rows[1]);
  });
  it("collects interleaved reads, searches and writes into one row per category", () => {
    const groups = groupWorkEntries([
      toolEntry({
        type: "tool-hydrate_files",
        toolCallId: "gather",
        state: "output-available",
        output: { files: [{ drivePath: "Lecture 8.pdf" }] },
      }),
      lookupEntry([
        {
          type: "tool-search_materials",
          toolCallId: "search",
          state: "output-available",
          input: { query: "entropy" },
          output: { hits: [] },
        },
        {
          type: "tool-read_file",
          toolCallId: "read",
          state: "output-available",
          output: { title: "Lecture 8.pdf" },
        },
      ]),
      toolEntry({
        type: "tool-box_write",
        toolCallId: "write",
        state: "output-available",
        input: { path: "/out/summary.md" },
      }),
      toolEntry({
        type: "tool-publish_output",
        toolCallId: "save",
        state: "output-available",
        input: { title: "Summary" },
      }),
    ]);
    expect(groups.map((group) => [group.id, group.calls.length])).toEqual([
      ["explore", 3],
      ["build", 1],
      ["write", 1],
    ]);
    expect(groups[1]?.calls.map((call) => call.label)).toEqual(["Wrote summary.md"]);
    expect(groups[2]?.calls.map((call) => call.label)).toEqual(["Saved “Summary”"]);
    expect(groups[0]?.calls[0]).not.toHaveProperty("output");
  });

  it("keeps a running category live and deduplicates repeated call ids", () => {
    const call = toolEntry({
      type: "tool-box_write",
      toolCallId: "write",
      state: "input-available",
      input: { path: "/out/summary.md" },
    });
    const groups = groupWorkEntries([call, call]);
    expect(groups[0]).toMatchObject({ label: "Working in the sandbox", status: "running" });
    expect(groups[0]?.calls).toHaveLength(1);
  });
});

it("hides internal preparation, removes code and coalesces identical previews", () => {
  const entries = [
    toolEntry({
      type: "tool-load_skill",
      toolCallId: "skill",
      state: "output-available",
      input: { skills: ["private-skill-name"] },
    }),
    toolEntry({
      type: "tool-sandbox_exec",
      toolCallId: "exec",
      state: "output-available",
      input: { command: "SECRET_CODE" },
      output: { output: "INTERNAL_STDOUT", exitCode: 0, activity: "Checked flame controls" },
    }),
    ...Array.from({ length: 5 }, (_, i) =>
      toolEntry({
        type: "tool-preview_widget",
        toolCallId: `preview-${i}`,
        state: "output-available",
        output: { ok: true },
      }),
    ),
  ];
  const groups = groupWorkEntries(entries);
  expect(groups.map((group) => group.id)).toEqual(["build", "preview"]);
  expect(groups[1]?.calls).toHaveLength(1);
  expect(groups[0]?.calls[0]).toMatchObject({ label: "Checked flame controls", detail: null });
  expect(JSON.stringify(groups)).not.toMatch(/SECRET_CODE|INTERNAL_STDOUT|private-skill-name/);
});
it("resolves the group after a successful retry while retaining the earlier diagnostic", () => {
  const groups = groupWorkEntries(
    [false, true].map((ok, i) =>
      toolEntry({
        type: "tool-preview_widget",
        toolCallId: `p${i}`,
        state: "output-available",
        output: { ok, activity: "Looks good" },
      }),
    ),
  );
  expect(groups[0]).toMatchObject({ status: "done", label: "Checked the figure" });
  expect(groups[0]?.calls).toHaveLength(2);
  expect(groups[0]?.calls[0]?.status).toBe("error");
  expect(groups[0]?.calls[0]?.label).not.toBe("Looks good");
});

it("keeps mobile and web activity grouping consistent for historical and new results", () => {
  const entries = [
    toolEntry({ type: "tool-load_skill", toolCallId: "s", state: "output-available" }),
    toolEntry({
      type: "tool-sandbox_exec",
      toolCallId: "e",
      state: "output-available",
      output: { activity: "Checked the controls", exitCode: 0 },
    }),
    toolEntry({
      type: "tool-preview_widget",
      toolCallId: "p",
      state: "output-available",
      output: { ok: false },
    }),
  ];
  expect(mobileGroups(entries)).toEqual(groupWorkEntries(entries));
});

it("uses a neutral collapsed label for an unresolved attempt and keeps its diagnostic", () => {
  const entry = toolEntry({
    type: "tool-sandbox_exec",
    toolCallId: "e",
    state: "output-error",
    errorText: "Session unavailable",
  });
  for (const group of [groupWorkEntries, mobileGroups]) {
    const result = group([entry]);
    expect(result[0]).toMatchObject({ label: "Sandbox activity", status: "error" });
    expect(result[0]?.calls[0]).toMatchObject({ status: "error", detail: "Session unavailable" });
  }
});

it("shows ongoing recovery without letting a different tool clear the failed attempt", () => {
  const entries = [
    toolEntry({
      type: "tool-sandbox_exec",
      toolCallId: "failed",
      state: "output-error",
      errorText: "Unavailable",
    }),
    toolEntry({ type: "tool-sandbox_write", toolCallId: "write", state: "output-available" }),
  ];
  for (const group of [groupWorkEntries, mobileGroups]) {
    expect(group(entries)[0]).toMatchObject({ status: "error", label: "Sandbox activity" });
    const retry = toolEntry({
      type: "tool-sandbox_exec",
      toolCallId: "retry",
      state: "input-available",
    });
    expect(group([...entries, retry])[0]).toMatchObject({
      status: "running",
      label: "Working in the sandbox",
    });
  }
});
