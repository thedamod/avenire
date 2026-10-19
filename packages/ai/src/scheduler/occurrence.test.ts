import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { nextOccurrence, validateSchedule } from "./occurrence.ts";

const next = (expression: string, zone: string, after: string) =>
  nextOccurrence({ _tag: "cron", expression }, zone, DateTime.makeUnsafe(after)).pipe(
    Option.map(DateTime.formatIso),
  );
describe("nextOccurrence", () => {
  it("keeps 03:00 local through New York's spring DST change", () => {
    expect(next("0 3 * * *", "America/New_York", "2026-03-07T08:00:00Z")).toEqual(
      Option.some("2026-03-08T07:00:00.000Z"),
    );
    expect(next("0 3 * * *", "America/New_York", "2026-03-08T07:00:00Z")).toEqual(
      Option.some("2026-03-09T07:00:00.000Z"),
    );
  });
  it("keeps 03:00 local through the fall DST change", () => {
    expect(next("0 3 * * *", "America/New_York", "2026-10-31T07:00:00Z")).toEqual(
      Option.some("2026-11-01T08:00:00.000Z"),
    );
  });
  it("evaluates the half-hour offset in Kolkata", () => {
    expect(next("0 3 * * *", "Asia/Kolkata", "2026-10-09T20:00:00Z")).toEqual(
      Option.some("2026-10-09T21:30:00.000Z"),
    );
  });
  it("once is strictly after, not at or before, the supplied instant", () => {
    const after = DateTime.makeUnsafe("2026-10-09T00:00:00Z");
    expect(nextOccurrence({ _tag: "once", at: "2026-10-08T00:00:00Z" }, "UTC", after)).toEqual(
      Option.none(),
    );
    expect(nextOccurrence({ _tag: "once", at: "2026-10-09T00:00:00Z" }, "UTC", after)).toEqual(
      Option.none(),
    );
    expect(
      nextOccurrence({ _tag: "once", at: "2026-10-10T00:00:00Z" }, "UTC", after).pipe(
        Option.map(DateTime.formatIso),
      ),
    ).toEqual(Option.some("2026-10-10T00:00:00.000Z"));
  });
  it.effect("returns readable Conflict errors for invalid cron, zone and once date", () =>
    Effect.gen(function* () {
      const after = DateTime.makeUnsafe("2026-10-09");
      for (const [schedule, zone, reason] of [
        [{ _tag: "cron", expression: "bad cron" }, "UTC", "Invalid cron"],
        [{ _tag: "cron", expression: "0 3 * * *" }, "Mars/Olympus", "IANA time zone"],
        [{ _tag: "once", at: "not a date" }, "UTC", "ISO date"],
        [{ _tag: "cron", expression: "0 3 31 2 *" }, "UTC", "reachable calendar"],
      ] as const) {
        const error = yield* Effect.flip(validateSchedule(schedule, zone, after));
        expect(error._tag).toBe("Conflict");
        expect(error.reason).toContain(reason);
      }
    }),
  );
});
