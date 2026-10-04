import { describe, expect, it } from "@effect/vitest";

import type { CloudSchedule } from "@avenire/contracts";
import { artifactPlan, materialWindow } from "./window.ts";

const schedule = (runAt: string, timeZone: string): Pick<CloudSchedule, "runAt" | "timeZone"> => ({
  runAt,
  timeZone,
});

describe("Ruth Cloud material windows", () => {
  it("maps daily scheduled boundaries in Asia/Kolkata to UTC", () => {
    expect(materialWindow(schedule("03:00", "Asia/Kolkata"), "2026-10-02T21:31:00Z")).toEqual({
      due: true,
      windowStart: "2026-10-01T21:30:00.000Z",
      windowEnd: "2026-10-02T21:30:00.000Z",
    });
  });

  it("resolves America/Los_Angeles wall time using the daylight offset", () => {
    expect(
      materialWindow(schedule("03:00", "America/Los_Angeles"), "2026-10-03T11:00:00Z"),
    ).toEqual({
      due: true,
      windowStart: "2026-10-02T10:00:00.000Z",
      windowEnd: "2026-10-03T10:00:00.000Z",
    });
  });

  it("is not due before the current day's scheduled boundary", () => {
    expect(materialWindow(schedule("03:00", "Asia/Kolkata"), "2026-10-02T20:00:00Z").due).toBe(
      false,
    );
  });

  it("includes the run instant at the window end and starts the next window after it", () => {
    const atBoundary = materialWindow(
      schedule("03:00", "Asia/Kolkata"),
      "2026-10-02T21:30:00.000Z",
    );
    const afterBoundary = materialWindow(
      schedule("03:00", "Asia/Kolkata"),
      "2026-10-02T21:30:00.001Z",
    );
    expect(atBoundary.due).toBe(true);
    expect(atBoundary.windowEnd).toBe("2026-10-02T21:30:00.000Z");
    expect(afterBoundary.windowStart).toBe(atBoundary.windowStart);
    expect(afterBoundary.windowEnd).toBe(atBoundary.windowEnd);
  });

  it("plans only supported requested artifact formats", () => {
    expect(
      artifactPlan(["notes", "quiz", "flashcards", "research", "summary", "recording"]),
    ).toEqual([
      { kind: "notes", fileName: "notes.md", mimeType: "text/markdown", title: "Study notes" },
      {
        kind: "quiz",
        fileName: "quiz.json",
        mimeType: "application/json",
        title: "Knowledge quiz",
      },
      {
        kind: "flashcards",
        fileName: "flashcards.json",
        mimeType: "application/json",
        title: "Flashcards",
      },
      {
        kind: "research",
        fileName: "research.md",
        mimeType: "text/markdown",
        title: "Further research",
      },
      {
        kind: "summary",
        fileName: "summary.md",
        mimeType: "text/markdown",
        title: "Study summary",
      },
    ]);
  });
});
