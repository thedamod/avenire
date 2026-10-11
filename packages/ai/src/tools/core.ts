import type { CloudRunId, PageContext, ThreadId, UserId } from "@avenire/contracts";
import { Analytics } from "@avenire/shared/observability";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export interface AgentContext {
  readonly userId: UserId;
  readonly agent: "ruth" | "ruth-cloud";
  readonly threadId?: ThreadId;
  readonly runId?: CloudRunId;
  readonly fullAccess: boolean;
  /** The user's IANA zone determines local-day selectors. */
  readonly timeZone: string;
  readonly page?: PageContext;
}
export class RuthToolError extends Schema.TaggedError<RuthToolError>()("RuthToolError", {
  tool: Schema.String,
  code: Schema.Literals([
    "invalid_input",
    "not_found",
    "forbidden",
    "denied",
    "conflict",
    "timeout",
    "quota_exceeded",
    "sandbox_unavailable",
    "failed",
  ]),
  message: Schema.String,
  recoverable: Schema.Boolean,
}) {}
export interface TaggedToolError {
  readonly _tag: string;
}
export type ToolImpl<I, O, R> = (
  input: I,
  ctx: AgentContext,
) => Effect.Effect<O, TaggedToolError, R>;

const codes: Readonly<Record<string, RuthToolError["code"]>> = {
  NotFound: "not_found",
  ObjectNotFound: "not_found",
  Conflict: "conflict",
  Unauthorized: "forbidden",
  SandboxTimeout: "timeout",
  SandboxQuotaExceeded: "quota_exceeded",
  SandboxUnavailable: "sandbox_unavailable",
  SandboxInputRejected: "invalid_input",
};
const unexpected = "The tool failed unexpectedly. Try a different approach.";

/** Match tags rather than service classes so Cloud remains outside the core dependency graph. */
export const toToolError = (
  tool: string,
  cause: Cause.Cause<unknown>,
): Effect.Effect<never, RuthToolError> => {
  if (Cause.hasInterrupts(cause))
    return Effect.failCause(Cause.fromReasons(cause.reasons.filter(Cause.isInterruptReason)));
  if (Cause.hasDies(cause))
    return Effect.fail(
      new RuthToolError({ tool, code: "failed", message: unexpected, recoverable: true }),
    );
  const found = Cause.findErrorOption(cause);
  if (Option.isNone(found))
    return Effect.fail(
      new RuthToolError({ tool, code: "failed", message: unexpected, recoverable: true }),
    );
  const error = found.value;
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "RuthToolError"
  )
    return Effect.fail(error as RuthToolError);
  const tagged =
    typeof error === "object" && error !== null
      ? (error as { _tag?: string; message?: unknown; reason?: unknown })
      : {};
  const code =
    tagged._tag !== undefined && Object.hasOwn(codes, tagged._tag) ? codes[tagged._tag]! : "failed";
  const message =
    typeof tagged.message === "string"
      ? tagged.message
      : typeof tagged.reason === "string"
        ? tagged.reason
        : unexpected;
  return Effect.fail(
    new RuthToolError({
      tool,
      code,
      message,
      recoverable: code !== "forbidden" && code !== "denied",
    }),
  );
};

/** Log exactly one outcome; inputs and outputs never enter telemetry. */
export const runTool = <A, E, R>(
  name: string,
  ctx: AgentContext,
  program: Effect.Effect<A, E, R>,
): Effect.Effect<A, RuthToolError, R | Analytics> =>
  Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis;
    const analytics = yield* Analytics;
    const attributes = {
      tool: name,
      agent: ctx.agent,
      userId: ctx.userId,
      threadId: ctx.threadId ?? null,
      runId: ctx.runId ?? null,
    };
    return yield* program.pipe(
      Effect.catchCause((cause) => toToolError(name, cause)),
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const end = yield* Clock.currentTimeMillis;
          const failure = Exit.isFailure(exit)
            ? Cause.findErrorOption(exit.cause)
            : Option.none<RuthToolError>();
          const properties = {
            ...attributes,
            outcome: Exit.isSuccess(exit)
              ? "success"
              : Cause.hasInterrupts(exit.cause)
                ? "interrupted"
                : "failure",
            errorCode: Option.isSome(failure) ? failure.value.code : null,
            durationMs: end - start,
          };
          yield* Effect.logInfo("Ruth tool call", properties);
          yield* analytics.capture({ distinctId: ctx.userId, event: "ruth_tool_call", properties });
        }),
      ),
    );
  }).pipe(
    Effect.withSpan(`RuthTool.${name}`, {
      attributes: {
        tool: name,
        agent: ctx.agent,
        userId: ctx.userId,
        threadId: ctx.threadId ?? null,
        runId: ctx.runId ?? null,
      },
    }),
  );
