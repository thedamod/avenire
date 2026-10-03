import * as DateTime from "effect/DateTime";

import type { ArtifactKind, CloudSchedule } from "@avenire/contracts";

export interface MaterialWindow {
  readonly due: boolean;
  /** UTC instants, ISO-8601. The material interval is [windowStart, windowEnd). */
  readonly windowStart: string;
  readonly windowEnd: string;
}

export interface PlannedArtifact {
  readonly kind: Exclude<ArtifactKind, "recording" | "plot" | "video">;
  readonly fileName: string;
  readonly mimeType: string;
  readonly title: string;
}

const planByKind: Partial<Record<ArtifactKind, PlannedArtifact>> = {
  notes: { kind: "notes", fileName: "notes.md", mimeType: "text/markdown", title: "Study notes" },
  quiz: {
    kind: "quiz",
    fileName: "quiz.json",
    mimeType: "application/json",
    title: "Knowledge quiz",
  },
  flashcards: {
    kind: "flashcards",
    fileName: "flashcards.json",
    mimeType: "application/json",
    title: "Flashcards",
  },
  research: {
    kind: "research",
    fileName: "research.md",
    mimeType: "text/markdown",
    title: "Further research",
  },
  summary: {
    kind: "summary",
    fileName: "summary.md",
    mimeType: "text/markdown",
    title: "Study summary",
  },
};

export const artifactPlan = (kinds: ReadonlyArray<ArtifactKind>): ReadonlyArray<PlannedArtifact> =>
  kinds.flatMap((kind) => {
    const planned = planByKind[kind];
    return planned === undefined ? [] : [planned];
  });

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/** `runAt` (HH:mm) on the same local calendar day as `date`, in `timeZone`. */
const atLocalTime = (date: DateTime.DateTime, runAt: string, timeZone: string): DateTime.Zoned => {
  const { year, month, day } = DateTime.toParts(date);
  return DateTime.makeZonedUnsafe(`${pad(year, 4)}-${pad(month)}-${pad(day)}T${runAt}:00`, {
    timeZone,
    adjustForTimeZone: true,
  });
};

const asUtcIso = (instant: DateTime.DateTime): string =>
  DateTime.formatIso(DateTime.makeUnsafe(instant.epochMilliseconds));

/** Finds the latest scheduled wall-clock boundary and its preceding local-day boundary. */
export const materialWindow = (
  schedule: Pick<CloudSchedule, "runAt" | "timeZone">,
  now: DateTime.DateTime | string,
): MaterialWindow => {
  const instant = typeof now === "string" ? DateTime.makeUnsafe(now) : now;
  const localNow = DateTime.makeZonedUnsafe(instant, { timeZone: schedule.timeZone });
  const candidate = atLocalTime(localNow, schedule.runAt, schedule.timeZone);
  const due = instant.epochMilliseconds >= candidate.epochMilliseconds;
  const windowEnd = due ? candidate : DateTime.subtract(candidate, { days: 1 });
  const windowStart = DateTime.subtract(windowEnd, { days: 1 });

  return { due, windowStart: asUtcIso(windowStart), windowEnd: asUtcIso(windowEnd) };
};
