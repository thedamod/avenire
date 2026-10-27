import { describe, expect, it } from "vite-plus/test";
import type { LibraryFile } from "@avenire/contracts";
import { applyProgress, settleCapture, startCapture } from "./liveCapture";

const file = (id: string, title: string) => ({ id, title, kind: "pdf" }) as unknown as LibraryFile;
const started = {
  id: "cap",
  items: [
    { key: "tab:a", title: "Paper", kind: "web-page", status: "pending" as const },
    { key: "local:b", title: "notes.pdf", kind: "pdf", status: "pending" as const },
  ],
};

describe("live capture", () => {
  it("starts with every item pending and applies progress in seq order", () => {
    let live = startCapture(undefined, started);
    expect(live.rows.map((row) => row.status)).toEqual(["pending", "pending"]);
    live = applyProgress(live, { id: "cap", seq: 1, key: "local:b", status: "uploading" });
    live = applyProgress(live, {
      id: "cap",
      seq: 2,
      key: "local:b",
      status: "saved",
      file: file("f1", "notes.pdf"),
    });
    // A replayed older event never moves a row backwards.
    live = applyProgress(live, { id: "cap", seq: 1, key: "local:b", status: "uploading" });
    expect(live.rows[1]).toMatchObject({ status: "saved", file: { id: "f1" } });
    live = applyProgress(live, {
      id: "cap",
      seq: 3,
      key: "tab:a",
      status: "failed",
      reason: "Reconnect the extension",
    });
    expect(live.rows[0]).toMatchObject({ status: "failed", reason: "Reconnect the extension" });
  });

  it("adds late items to the same capture and keeps rows across a started replay", () => {
    let live = startCapture(undefined, started);
    live = applyProgress(live, {
      id: "cap",
      seq: 1,
      key: "local:c",
      status: "pending",
      title: "slides.pptx",
      kind: "document",
    });
    live = applyProgress(live, { id: "cap", seq: 2, key: "tab:a", status: "uploading" });
    live = startCapture(live, started);
    expect(live.rows.map((row) => [row.key, row.status])).toEqual([
      ["tab:a", "uploading"],
      ["local:b", "pending"],
      ["local:c", "pending"],
    ]);
  });

  it("merges the final receipt into the live rows without duplicating uploads", () => {
    let live = startCapture(undefined, started);
    live = applyProgress(live, {
      id: "cap",
      seq: 1,
      key: "local:b",
      status: "saved",
      file: file("f1", "notes.pdf"),
    });
    live = applyProgress(live, {
      id: "cap",
      seq: 2,
      key: "tab:a",
      status: "skipped",
      reason: "Queued for server capture; browser content was unavailable.",
    });
    live = settleCapture(live, "cap", {
      capturedAt: "2026-10-25T00:00:00Z",
      files: [file("f1", "notes.pdf"), file("f2", "Paper"), file("f3", "Extra")],
      skipped: [{ title: "Old tab", reason: "Seen too briefly" }],
      blocked: [{ title: "Inbox", category: "email" }],
    });
    expect(live.receipt).toBeDefined();
    expect(live.rows.map((row) => [row.title, row.status, row.reason])).toEqual([
      ["Paper", "saved", undefined],
      ["notes.pdf", "saved", undefined],
      ["Extra", "saved", undefined],
      ["Old tab", "skipped", "Seen too briefly"],
      ["Inbox", "skipped", "Not captured · email"],
    ]);
  });

  it("settles a capture whose live events never arrived (reload after it finished)", () => {
    const live = settleCapture(undefined, "cap", {
      capturedAt: "2026-10-25T00:00:00Z",
      files: [file("f1", "notes.pdf")],
      skipped: [],
      blocked: [],
    });
    expect(live.rows).toEqual([
      {
        key: "file:f1",
        title: "notes.pdf",
        kind: "pdf",
        status: "saved",
        file: file("f1", "notes.pdf"),
      },
    ]);
  });
});
