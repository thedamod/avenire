import type { RuthUIMessage } from "@avenire/ai/message-types";
import { describe, expect, it } from "vite-plus/test";
import { createRowsDeriver, deriveRows, stabilizeRows } from "./rows.ts";
import { deriveRows as mobileRows } from "../../../../../mobile/src/features/chat/thread/rows.ts";
import type { DeriveRowsInput } from "./types.ts";

const user = (id: string, text: string) =>
  ({ id, role: "user", parts: [{ type: "text", text }] }) as RuthUIMessage;

const assistant = (id: string, parts: unknown[]) =>
  ({ id, role: "assistant", parts }) as unknown as RuthUIMessage;

const search = (id: string, query: string, fileIds: string[]) => ({
  type: "tool-search_materials",
  toolCallId: id,
  state: "output-available",
  input: { query },
  output: { hits: fileIds.map((fileId) => ({ fileId, chunkId: `${fileId}-c`, title: fileId })) },
});

const input = (
  messages: RuthUIMessage[],
  extra: Partial<DeriveRowsInput> = {},
): DeriveRowsInput => ({
  messages,
  status: "ready",
  workExpanded: new Map(),
  timings: new Map(),
  turnStartedAt: null,
  error: null,
  ...extra,
});

describe("deriveRows", () => {
  it("keeps tools separated by prose together in a single activity block", () => {
    const rows = deriveRows(
      input([
        assistant("a1", [
          {
            type: "tool-box_write",
            toolCallId: "w1",
            state: "output-available",
            input: { path: "/out/summary.md" },
          },
          { type: "text", text: "Now the quiz", state: "done" },
          {
            type: "tool-box_write",
            toolCallId: "w2",
            state: "output-available",
            input: { path: "/out/quiz.json" },
          },
        ]),
      ]),
    );
    const work = rows.filter((row) => row.kind === "work");
    expect(work).toHaveLength(1);
    expect(work[0]?.entries.flatMap((entry) => entry.calls.map((call) => call.id))).toEqual([
      "w1",
      "w2",
    ]);
    expect(rows.some((row) => row.kind === "prose" && row.text === "Now the quiz")).toBe(true);
  });
  it("keeps recoverable tool errors inside work alongside prose and media", () => {
    const rows = deriveRows(
      input([
        user("u1", "Fit my readings"),
        assistant("a1", [
          { type: "step-start" },
          search("s1", "cooling", ["f1", "f2"]),
          {
            type: "tool-read_file",
            toolCallId: "r1",
            state: "output-available",
            input: { fileId: "f3" },
            output: [{ fileId: "f3", title: "lab4.csv" }],
          },
          { type: "text", text: "Here is the fit:", state: "done" },
          {
            type: "tool-render_widget",
            toolCallId: "w1",
            state: "output-available",
            input: { title: "Fit" },
            output: { url: "https://w/1", title: "Fit", assetId: "a" },
          },
          {
            type: "tool-sandbox_exec",
            toolCallId: "x1",
            state: "output-error",
            input: { command: "python fit.py" },
            errorText: "boom",
          },
        ]),
      ]),
    );
    expect(rows.map((row) => row.kind)).toEqual(["user", "work-header", "work", "prose", "media"]);
    const work = rows[2];
    // Consecutive search + read fold into one entry over the three files they touched.
    expect(work?.kind === "work" && work.entries.map((entry) => entry.label)).toEqual([
      "Explored 3 files",
      "Ran a computation · failed",
    ]);
    if (work?.kind === "work") {
      expect(work.entries[1]?.calls[0]).toMatchObject({
        id: "x1",
        status: "error",
        detail: "boom",
      });
      expect(work.entries[0]?.calls).toMatchObject([
        {
          id: "s1",
          name: "search_materials",
          label: "Explored for “cooling” · 2 matches",
        },
        { id: "r1", name: "read_file", label: "Read lab4.csv" },
      ]);
    }
    const media = rows[4];
    expect(media?.kind === "media" && media.items[0]).toMatchObject({ kind: "widget", figure: 1 });
  });

  it.each(["streaming", "ready"] as const)(
    "keeps retryable failures quiet when the turn is %s on both clients",
    (status) => {
      const state = input(
        [
          user("u1", "Build a figure"),
          assistant("a1", [
            {
              type: "tool-render_widget",
              toolCallId: "failed-figure",
              state: "output-error",
              errorText: "Preview timed out",
            },
            {
              type: "dynamic-tool",
              toolName: "sandbox_exec",
              toolCallId: "failed-command",
              state: "output-error",
              errorText: "Session unavailable",
            },
            { type: "text", text: "Trying another approach", state: "done" },
          ]),
        ],
        { status },
      );
      for (const derive of [deriveRows, mobileRows]) {
        const rows = derive(state);
        expect(rows.filter((row) => row.kind === "error")).toHaveLength(0);
        const work = rows.find((row) => row.kind === "work");
        expect(work?.entries.flatMap((entry) => entry.calls)).toMatchObject([
          { id: "failed-figure", status: "error", detail: "Preview timed out" },
          { id: "failed-command", status: "error", detail: "Session unavailable" },
        ]);
      }
      expect(mobileRows(state)).toEqual(deriveRows(state));
    },
  );

  it("still surfaces a fatal turn failure on both clients", () => {
    const state = input([user("u1", "Build a figure")], {
      status: "error",
      error: "Connection lost",
    });
    for (const derive of [deriveRows, mobileRows]) {
      expect(derive(state).at(-1)).toMatchObject({ kind: "error", text: "Connection lost" });
    }
  });

  it("shows a thinking row while a turn has no visible output and keeps requests unfolded", () => {
    const pending = deriveRows(
      input([user("u1", "Hi")], { status: "submitted", turnStartedAt: 5 }),
    );
    expect(pending.at(-1)).toMatchObject({ kind: "thinking", startedAt: 5 });

    const asking = deriveRows(
      input(
        [
          user("u1", "Plan"),
          assistant("a1", [
            {
              type: "tool-ask_user",
              toolCallId: "q1",
              state: "input-available",
              input: { question: "Which exam?", allowCustom: true },
            },
          ]),
        ],
        { status: "streaming", workExpanded: new Map([["a1", false]]) },
      ),
    );
    expect(asking.map((row) => row.kind)).toEqual(["user", "request"]);
  });
});

describe("stabilizeRows and the streaming short-circuit", () => {
  it("reuses unchanged row objects and only replaces the streaming prose row", () => {
    const derive = createRowsDeriver();
    const first = user("u1", "Explain entropy");
    const prior = assistant("a0", [{ type: "text", text: "Earlier answer", state: "done" }]);
    const streamingA = assistant("a1", [
      search("s1", "entropy", ["f1"]),
      { type: "text", text: "Entropy counts", state: "streaming" },
    ]);
    const before = derive(input([first, prior, streamingA], { status: "streaming" }));
    const streamingB = assistant("a1", [
      search("s1", "entropy", ["f1"]),
      { type: "text", text: "Entropy counts arrangements", state: "streaming" },
    ]);
    const after = derive(input([first, prior, streamingB], { status: "streaming" }));

    expect(after).not.toBe(before);
    expect(after.length).toBe(before.length);
    const changed = after.filter((row, index) => row !== before[index]);
    expect(changed.map((row) => row.id)).toEqual(["a1:p1"]);
  });

  it("returns the previous array when nothing changed", () => {
    const rows = deriveRows(input([user("u1", "Hi")]));
    const again = deriveRows(input([user("u1", "Hi")]));
    expect(stabilizeRows(rows, again)).toBe(rows);
  });
});
