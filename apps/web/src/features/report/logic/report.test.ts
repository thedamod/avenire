import type { RuthUIMessage } from "@avenire/ai/message-types";
import type { FileId, LibraryFile, PendingApproval } from "@avenire/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  changesMeta,
  fileChanges,
  followUps,
  outputTabs,
  runProducts,
  startHere,
  tabLabel,
} from "./report.ts";

const tool = (name: string, input: unknown, output: unknown) => ({
  type: `tool-${name}`,
  toolCallId: `${name}-${JSON.stringify(output).length}`,
  state: "output-available",
  input,
  output,
});

const run = (parts: unknown[]) =>
  ({ id: "run-1", role: "assistant", parts }) as unknown as RuthUIMessage;

const file = (id: string, kind: LibraryFile["kind"], title: string, extra = {}) =>
  ({
    id,
    kind,
    title,
    placement: "filed",
    folderIds: [],
    mimeType: null,
    origin: null,
    access: "open",
    ...extra,
  }) as unknown as LibraryFile;

const stream = run([
  tool("hydrate_files", {}, { files: [{ fileId: "lec7" }, { fileId: "note1" }] }),
  tool("publish_output", { title: "Summary: Entropy" }, { kind: "file", fileId: "sum" }),
  tool("publish_output", { title: "quiz.json" }, { kind: "file", fileId: "quiz" }),
  tool(
    "publish_output",
    { title: "Entropy note", replaces: "note1" },
    { kind: "sync", approvalId: "ap1", conflict: null },
  ),
]);

describe("runProducts", () => {
  it("collects hydrated sources, published files and proposals", () => {
    const products = runProducts([stream]);
    expect(products.hydrated).toEqual(["lec7", "note1"]);
    expect(products.published.map((item) => item.fileId)).toEqual(["sum", "quiz"]);
    expect(products.proposals).toEqual([
      { approvalId: "ap1", fileId: "note1", title: "Entropy note", conflict: null },
    ]);
  });
});

describe("outputTabs", () => {
  const products = runProducts([stream]);
  const fileById = new Map<FileId, LibraryFile>([
    ["sum" as FileId, file("sum", "note", "Summary: Entropy and the second law")],
    ["quiz" as FileId, file("quiz", "document", "quiz.json", { mimeType: "application/json" })],
    ["lec7" as FileId, file("lec7", "pdf", "Lecture 7 · Entropy.pdf")],
  ]);

  it("orders the main note, the quiz, widgets and the main source", () => {
    const tabs = outputTabs({
      products,
      fileById,
      assets: [
        {
          id: "w1",
          kind: "widget",
          title: "Carnot cycle",
          url: "/a/w1",
          createdAt: "",
        } as never,
      ],
      quizzes: new Map([["quiz" as FileId, true]]),
      opened: [],
    });
    expect(tabs.map((tab) => [tab.kind, tab.label])).toEqual([
      ["note", "Summary"],
      ["quiz", "Quiz"],
      ["widget", "Carnot cycle"],
      ["source", "Lecture 7"],
    ]);
  });

  it("shows a JSON output that isn't a quiz as a plain source", () => {
    const tabs = outputTabs({
      products,
      fileById,
      assets: [],
      quizzes: new Map([["quiz" as FileId, false]]),
      opened: [],
    });
    expect(tabs.find((tab) => tab.key === "file:quiz")?.kind).toBe("source");
  });

  it("re-targets an existing source tab for a citation", () => {
    const tabs = outputTabs({
      products,
      fileById,
      assets: [],
      quizzes: new Map(),
      opened: [
        {
          kind: "source",
          key: "cite:lec7",
          fileId: "lec7" as FileId,
          title: "Lecture 7",
          label: "Lecture 7",
          target: { page: 4 },
          transient: true,
        },
      ],
    });
    const source = tabs.filter((tab) => tab.kind === "source");
    expect(source).toHaveLength(1);
    expect(source[0]).toMatchObject({ key: "file:lec7", target: { page: 4 } });
  });
});

describe("tabLabel", () => {
  it("keeps short heads of titles", () => {
    expect(tabLabel("Summary: Entropy and the second law")).toBe("Summary");
    expect(tabLabel("Lecture 8 · Heat engines.pdf")).toBe("Lecture 8");
    expect(tabLabel("Raptor 2 test stand and plumbing")).toBe("Raptor 2 test");
    expect(tabLabel("quiz.json")).toBe("quiz");
  });
});

describe("startHere", () => {
  it("finds Ruth's pointer in the summary", () => {
    expect(
      startHere(
        "Good morning. I made a summary and a quiz. **Start with** the summary, since the quiz builds on it.",
      ),
    ).toBe("Start with the summary, since the quiz builds on it.");
    expect(startHere("Nothing to point at.")).toBeNull();
  });
});

describe("fileChanges", () => {
  const products = runProducts([stream]);
  const open = (status: PendingApproval["status"]) =>
    [
      {
        id: "ap1",
        fileId: "note1",
        fileTitle: "Entropy and the second law",
        status,
        conflict: status === "conflict" ? "Edited since Ruth read it" : null,
        summary: "Add the free-expansion example",
      },
    ] as unknown as PendingApproval[];

  it("joins proposals with open approvals", () => {
    const changes = fileChanges({
      proposals: products.proposals,
      open: open("pending"),
      decided: new Map(),
      fileById: new Map(),
    });
    expect(changes.rows[0]).toMatchObject({
      title: "Entropy and the second law",
      status: "pending",
      detail: "Add the free-expansion example",
    });
    expect(changes.waiting).toBe(1);
  });

  it("marks proposals the server no longer lists as resolved, and counts session decisions", () => {
    const resolved = fileChanges({
      proposals: products.proposals,
      open: [],
      decided: new Map(),
      fileById: new Map(),
    });
    expect(resolved.rows[0]!.status).toBe("resolved");
    const decided = fileChanges({
      proposals: products.proposals,
      open: [],
      decided: new Map([["ap1", "accepted"]]),
      fileById: new Map(),
    });
    expect(changesMeta(decided)).toBe("1 accepted");
  });

  it("uses durable accepted and skipped statuses after reload", () => {
    for (const status of ["accepted", "skipped"] as const) {
      const changes = fileChanges({
        proposals: products.proposals,
        open: open(status),
        decided: new Map(),
        fileById: new Map(),
      });
      expect(changes.rows[0]?.status).toBe(status);
      expect(changes.waiting).toBe(0);
      expect(changes[status]).toBe(1);
    }
  });

  it("shows the conflict as the detail", () => {
    const changes = fileChanges({
      proposals: [],
      open: open("conflict"),
      decided: new Map(),
      fileById: new Map(),
    });
    expect(changes.rows[0]).toMatchObject({
      status: "conflict",
      detail: "Edited since Ruth read it",
    });
  });
});

describe("followUps", () => {
  const msg = (id: string, role: "user" | "assistant", runId?: string) =>
    ({
      id,
      role,
      parts: [
        { type: "text", text: id },
        ...(runId ? [{ type: "data-cloud-run", id: runId, data: { runId } }] : []),
      ],
    }) as unknown as RuthUIMessage;
  const thread = [
    msg("r1", "assistant", "run-1"),
    msg("u1", "user"),
    msg("a1", "assistant"),
    msg("r2", "assistant", "run-2"),
    msg("u2", "user"),
  ];

  it("takes the messages after the run's report up to the next report", () => {
    expect(followUps(thread, "run-1", null).map((item) => item.id)).toEqual(["u1", "a1"]);
    expect(followUps(thread, "run-2", null).map((item) => item.id)).toEqual(["u2"]);
  });

  it("groups explicitly tagged interleaved follow-ups by run and prefers the report message id", () => {
    const tagged = (id: string, runId: string) =>
      ({ ...msg(id, "user"), metadata: { createdAt: "now", runId } }) as RuthUIMessage;
    const messages = [...thread, tagged("u3", "run-1"), tagged("u4", "run-2")];
    expect(followUps(messages, "run-1", null).map((item) => item.id)).toEqual(["u1", "a1", "u3"]);
    expect(followUps(messages, "run-2", null).map((item) => item.id)).toEqual(["u2", "u4"]);
    expect(followUps(thread, "old-run", null, "r1").map((item) => item.id)).toEqual(["u1", "a1"]);
  });

  it("adds what this page sent at the end of the thread", () => {
    expect(followUps(thread, "run-1", 4).map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
    expect(followUps(thread, "run-3", 4).map((item) => item.id)).toEqual(["u2"]);
  });
});
