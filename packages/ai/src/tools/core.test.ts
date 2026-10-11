import { Conflict, NotFound, Unauthorized } from "@avenire/contracts";
import { Analytics, type AnalyticsEvent } from "@avenire/shared/observability";
import { describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import { RuthToolError, runTool, toToolError } from "./core.ts";
import { ctx, recordingAnalytics } from "./test-support.ts";

const cases: Array<[unknown, RuthToolError["code"], string]> = [
  [new NotFound({ entity: "File", id: "missing" }), "not_found", "File missing was not found"],
  [new Conflict({ reason: "Changed" }), "conflict", "Changed"],
  [new Unauthorized({}), "forbidden", "Not signed in"],
  ...(
    [
      ["SandboxTimeout", "timeout"],
      ["SandboxQuotaExceeded", "quota_exceeded"],
      ["SandboxUnavailable", "sandbox_unavailable"],
      ["SandboxInputRejected", "invalid_input"],
    ] as const
  ).map(([tag, code]): [unknown, RuthToolError["code"], string] => [
    { _tag: tag, reason: "Readable reason" },
    code,
    "Readable reason",
  ]),
  [{ _tag: "OtherExpected", message: "Try again" }, "failed", "Try again"],
];
describe("toToolError", () => {
  for (const [error, code, message] of cases)
    it.effect(`maps ${code}: ${message}`, () =>
      Effect.gen(function* () {
        const result = yield* toToolError("test", Cause.fail(error)).pipe(Effect.result);
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "RuthToolError", tool: "test", code, message },
        });
      }),
    );
  it.effect("passes existing tool errors through unchanged", () =>
    Effect.gen(function* () {
      const error = new RuthToolError({
        tool: "original",
        code: "denied",
        message: "No",
        recoverable: false,
      });
      const result = yield* toToolError("other", Cause.fail(error)).pipe(Effect.result);
      expect(result._tag === "Failure" && result.failure).toBe(error);
    }),
  );
  it.effect("does not expose defects even with an expected failure in the cause", () =>
    Effect.gen(function* () {
      const cause = Cause.fromReasons([
        ...Cause.fail({ _tag: "Expected", message: "private" }).reasons,
        ...Cause.die("secret").reasons,
      ]);
      const result = yield* toToolError("test", cause).pipe(Effect.result);
      expect(result).toMatchObject({
        failure: {
          code: "failed",
          message: "The tool failed unexpectedly. Try a different approach.",
        },
      });
    }),
  );
  it.effect("preserves interruptors", () =>
    Effect.gen(function* () {
      const exit = yield* toToolError("test", Cause.interrupt(42)).pipe(Effect.exit);
      expect(Exit.isFailure(exit) && Cause.interruptors(exit.cause).has(42)).toBe(true);
    }),
  );
});
for (const failure of [false, true])
  it.effect(
    `captures exactly one ${failure ? "failure" : "success"} without inputs/outputs`,
    () => {
      const events: AnalyticsEvent[] = [];
      return Effect.gen(function* () {
        const result = yield* runTool(
          "test",
          ctx,
          failure
            ? Effect.fail(new Conflict({ reason: "Changed" }))
            : Effect.succeed({ privateOutput: "secret" }),
        ).pipe(Effect.exit);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          distinctId: ctx.userId,
          event: "ruth_tool_call",
          properties: {
            tool: "test",
            agent: "ruth",
            outcome: failure ? "failure" : "success",
            errorCode: failure ? "conflict" : null,
          },
        });
        expect(JSON.stringify(events)).not.toContain("secret");
        expect(Exit.isFailure(result)).toBe(failure);
      }).pipe(Effect.provideService(Analytics, recordingAnalytics(events)));
    },
  );
it.effect("captures interruption once", () => {
  const events: AnalyticsEvent[] = [];
  return Effect.gen(function* () {
    const exit = yield* runTool("cancelled", ctx, Effect.interrupt).pipe(Effect.exit);
    expect(Exit.isFailure(exit) && Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.properties?.outcome).toBe("interrupted");
  }).pipe(Effect.provideService(Analytics, recordingAnalytics(events)));
});

it.effect("passes a RuthToolError from another module instance through by tag", () =>
  Effect.gen(function* () {
    const error = {
      _tag: "RuthToolError",
      tool: "external",
      code: "denied",
      message: "Denied",
      recoverable: false,
    };
    const result = yield* toToolError("other", Cause.fail(error)).pipe(Effect.result);
    expect(result._tag === "Failure" && result.failure).toBe(error);
  }),
);
