import { Conflict, type CloudTaskSchedule } from "@avenire/contracts";
import * as Cron from "effect/Cron";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

/** Strictly later than `after`; named zones keep cron wall time stable across DST. */
export const nextOccurrence = (
  schedule: CloudTaskSchedule,
  timeZone: string,
  after: DateTime.Utc,
): Option.Option<DateTime.Utc> => {
  if (Option.isNone(DateTime.zoneMakeNamed(timeZone))) return Option.none();
  if (schedule._tag === "once")
    return DateTime.make(schedule.at).pipe(
      Option.filter((at) => at.epochMilliseconds > after.epochMilliseconds),
      Option.map(DateTime.toUtc),
    );
  const parsed = Cron.parse(schedule.expression, timeZone);
  if (Result.isFailure(parsed)) return Option.none();
  // Cron.next can reject a syntactically valid but impossible calendar (e.g. February 31).
  try {
    return Option.some(DateTime.toUtc(DateTime.makeUnsafe(Cron.next(parsed.success, after))));
  } catch {
    return Option.none();
  }
};

/** Validation belongs at the service boundary, where callers receive a domain error. */
export const validateSchedule = Effect.fn("CloudTasks.validateSchedule")(function* (
  schedule: CloudTaskSchedule,
  timeZone: string,
  after: DateTime.Utc,
) {
  if (Option.isNone(DateTime.zoneMakeNamed(timeZone)))
    return yield* new Conflict({ reason: `Unknown IANA time zone: ${timeZone}` });
  if (schedule._tag === "once") {
    if (Option.isNone(DateTime.make(schedule.at)))
      return yield* new Conflict({ reason: "The once schedule needs a valid ISO date and time." });
  } else {
    const parsed = Cron.parse(schedule.expression, timeZone);
    if (Result.isFailure(parsed))
      return yield* new Conflict({ reason: `Invalid cron: ${parsed.failure.message}` });
    if (Option.isNone(nextOccurrence(schedule, timeZone, after)))
      return yield* new Conflict({ reason: "The cron expression has no reachable calendar date." });
  }
  return nextOccurrence(schedule, timeZone, after);
});
