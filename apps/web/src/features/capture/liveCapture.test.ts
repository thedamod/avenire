import { describe, expect, it } from "vite-plus/test";
import type { LibraryFile } from "@avenire/contracts";
import {
  applyProgress,
  removeCaptureFile,
  captureHeading,
  overlayRows,
  settleCapture,
  startCapture,
} from "./liveCapture";

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

  it("builds the overlay's rows from main's items, then settles them with the receipt", () => {
    const items = [
      { key: "tab:a", title: "Paper", kind: "web-page", status: "pending" as const },
      {
        key: "local:b",
        title: "notes.pdf",
        status: "saved" as const,
        file: file("f1", "notes.pdf"),
      },
      {
        key: "local:c",
        title: "big.mov",
        kind: "bogus",
        status: "skipped" as const,
        reason: "Too big",
      },
    ];
    const streaming = overlayRows(items, undefined);
    expect(streaming.map((row) => [row.key, row.kind, row.status, row.reason])).toEqual([
      ["tab:a", "web-page", "pending", undefined],
      ["local:b", "pdf", "saved", undefined],
      ["local:c", "document", "skipped", "Too big"],
    ]);
    const settled = overlayRows(items, {
      files: [file("f1", "notes.pdf"), file("f2", "Paper")],
      skipped: [{ title: "big.mov", reason: "Too big" }],
      blocked: [{ title: "Bank", category: "banking" }],
    });
    expect(settled.map((row) => [row.key, row.status, row.file?.id])).toEqual([
      ["tab:a", "saved", "f2"],
      ["local:b", "saved", "f1"],
      ["local:c", "skipped", undefined],
      ["blocked:0", "skipped", undefined],
    ]);
  });

  it("words the header for each phase", () => {
    const rows = overlayRows(
      [
        { key: "a", title: "A", status: "saved", file: file("f1", "A") },
        { key: "b", title: "B", status: "skipped", reason: "No" },
      ],
      undefined,
    );
    expect(captureHeading([], "capturing")).toBe("Capturing…");
    expect(captureHeading(rows, "capturing")).toBe("Capturing 2 things…");
    expect(captureHeading(rows, "done")).toBe("Captured 1 thing");
    expect(captureHeading(rows.slice(1), "done")).toBe("Nothing captured");
    expect(captureHeading(rows, "failed")).toBe("Capture failed");
  });
});

it("undo removes only the selected file and a late receipt cannot restore it", () => {
  const first = file("one", "One.pdf");
  const other = file("two", "Two.pdf");
  const receipt = { capturedAt: "now", files: [first, other], skipped: [], blocked: [] };
  let live = settleCapture(undefined, "cap", receipt);
  live = removeCaptureFile(live, first.id);
  expect(live.rows.map((row) => row.file?.id)).toEqual([other.id]);
  live = settleCapture(live, "cap", receipt);
  expect(live.rows.map((row) => row.file?.id)).toEqual([other.id]);
  expect(
    applyProgress(live, {
      id: "cap",
      seq: live.seq + 1,
      key: "file:one",
      status: "saved",
      file: first,
    }),
  ).toBe(live);
});
