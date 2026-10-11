import { describe, expect, it } from "@effect/vitest";
import { CLOUD_INPUTS, CLOUD_WORKSPACE } from "@avenire/cloud/cloud-box";
import {
  detectConflict,
  planEviction,
  planHydration,
  publishPath,
  sandboxPathFor,
} from "./tools.ts";

const path = (overrides: Partial<Parameters<typeof sandboxPathFor>[0]> = {}) =>
  sandboxPathFor({ fileId: "12345678-rest", title: "Lecture", kind: "pdf", ...overrides });
describe("Cloud planning", () => {
  it("sanitizes unsafe/empty components and bounds long titles/folders", () => {
    expect(path({ title: "../bad:/title\0.pdf", folderName: "../unsafe/folder" })).toBe(
      `${CLOUD_INPUTS}/_unsafe_folder/_bad__title_-12345678.pdf`,
    );
    expect(path({ title: ".", folderName: ".." })).toBe(
      `${CLOUD_INPUTS}/Inbox/Untitled-12345678.pdf`,
    );
    const long = path({ title: "A".repeat(200), folderName: "B".repeat(200) })
      .slice(CLOUD_INPUTS.length + 1)
      .split("/");
    expect(long[0]).toHaveLength(80);
    expect(long[1]).toHaveLength(80 + 9 + 4);
  });
  it("infers extensions from mime/title/kind, uses md for projections, and separates ids", () => {
    expect(path({ title: "photo", kind: "image", mimeType: "image/jpeg" })).toMatch(/\.jpg$/);
    expect(path({ title: "table.csv", kind: "document" })).toMatch(/\.csv$/);
    expect(path({ kind: "note" })).toMatch(/\.md$/);
    expect(path({ title: "movie.mp4", kind: "video", extracted: true })).toMatch(/\.md$/);
    expect(path()).not.toBe(path({ fileId: "abcdefgh-rest" }));
  });
  const candidate = (
    fileId: string,
    sizeBytes = 3,
    contentHash: string | null = "hash",
    sandboxPath = `/inputs/${fileId}`,
  ) => ({ fileId, sizeBytes, contentHash, sandboxPath });
  it("count cap includes skipped and signals truncation", () => {
    const a = candidate("a");
    const plan = planHydration(
      [a, candidate("b"), candidate("c")],
      [{ ...a, contentHash: "hash" }],
      { maxFiles: 2, maxBytes: 10 },
    );
    expect(plan.skipped).toEqual([a]);
    expect(plan.fetch.map((file) => file.fileId)).toEqual(["b"]);
    expect(plan.truncated).toEqual({ byCount: true, byBytes: false });
  });
  it("byte cap skips a large file and fits a later small one, ignoring skipped bytes", () => {
    const cached = candidate("cached", 100);
    const plan = planHydration(
      [candidate("a", 7), candidate("huge", 20), cached, candidate("small", 3)],
      [{ ...cached, contentHash: "hash" }],
      { maxFiles: 4, maxBytes: 10 },
    );
    expect(plan.fetch.map((file) => file.fileId)).toEqual(["a", "small"]);
    expect(plan.skipped).toEqual([cached]);
    expect(plan.truncated.byBytes).toBe(true);
  });
  it("skips only matching hash AND path; changed, moved and unknown hashes fetch", () => {
    const rows = [
      candidate("same"),
      candidate("changed"),
      candidate("moved"),
      candidate("unknown"),
    ].map((file) => ({ ...file, contentHash: "hash" }));
    const plan = planHydration(
      [
        candidate("same"),
        candidate("changed", 3, "new"),
        candidate("moved", 3, "hash", "/elsewhere"),
        candidate("unknown", 3, null),
      ],
      rows,
      { maxFiles: 4, maxBytes: 100 },
    );
    expect(plan.skipped.map((file) => file.fileId)).toEqual(["same"]);
    expect(plan.fetch.map((file) => file.fileId)).toEqual(["changed", "moved", "unknown"]);
  });
  it("evicts in LRU order until under cap and protects the current run", () => {
    const row = (
      fileId: string,
      sizeBytes: number,
      time: number,
      lastRunId: string | null = null,
    ) => ({ fileId, sizeBytes, lastUsedAt: new Date(time), lastRunId });
    const rows = [row("newer", 4, 20), row("protected", 7, 0, "run"), row("older", 5, 10)];
    expect(planEviction(rows, "run", 11).map((row) => row.fileId)).toEqual(["older"]);
    expect(planEviction(rows, "run", 6).map((row) => row.fileId)).toEqual(["older", "newer"]);
    expect(planEviction(rows, "run", 20)).toEqual([]);
  });
  it("detects hash conflicts, including missing hashes", () => {
    expect(detectConflict("a", "a", null)).toBeNull();
    expect(detectConflict("a", "b", new Date("2026-10-09T04:00:00Z"))).toBe(
      "Changed in your library on 2026-10-09 after Ruth Cloud copied it",
    );
    expect(detectConflict("a", null, null)).toContain("unknown date");
  });
  it("confines normalized publish paths and excludes internal .avenire", () => {
    for (const input of [
      "/etc/passwd",
      "../other/file",
      "a/../../file",
      `${CLOUD_WORKSPACE}/.avenire/run.json`,
      ".avenire",
      "out/../.avenire/token",
      "x\0y",
      `${CLOUD_WORKSPACE}x/file`,
    ])
      expect(publishPath(input)).toBeNull();
    expect(publishPath("out/../plot.png")).toBe(`${CLOUD_WORKSPACE}/plot.png`);
    expect(publishPath(".avenire-extra/file")).toBe(`${CLOUD_WORKSPACE}/.avenire-extra/file`);
  });
});
it("disambiguates shared UUIDv7 prefixes and preserves the assigned path on reuse", () => {
  const firstId = "019c1234-0000-7000-8000-000000000001";
  const secondId = "019c1234-0000-7000-8000-000000000002";
  const first = sandboxPathFor({ fileId: firstId, title: "Lecture", kind: "pdf" });
  const occupied = new Map([[first, firstId]]);
  const second = sandboxPathFor({ fileId: secondId, title: "Lecture", kind: "pdf" }, occupied);
  expect(first).not.toBe(second);
  expect(second).toMatch(/-019c1234-[a-f0-9]{16}\.pdf$/);
  occupied.set(second, secondId);
  expect(sandboxPathFor({ fileId: secondId, title: "Lecture", kind: "pdf" }, occupied)).toBe(
    second,
  );
});
it("keeps Unicode filenames within filesystem byte limits even after disambiguation", () => {
  const input = {
    fileId: "019c1234-0000-7000-8000-000000000002",
    title: "字".repeat(80),
    kind: "pdf" as const,
  };
  const short = sandboxPathFor(input);
  const long = sandboxPathFor(input, new Map([[short, "other-file"]]));
  expect(Buffer.byteLength(long.split("/").at(-1)!)).toBeLessThanOrEqual(255);
});
