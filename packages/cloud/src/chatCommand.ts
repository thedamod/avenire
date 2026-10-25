/** Submit once, then recover the command identity and poll its durable session result. */
import { DaytonaNotFoundError, DaytonaConflictError, type Sandbox } from "@daytonaio/sdk";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { attempt, CloudError, isTransientCloudError, SandboxTimeout } from "./daytona.ts";

let sequence = 0;
const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const read = <A>(operation: string, run: () => Promise<A>) =>
  attempt(operation, run).pipe(
    Effect.retry({
      times: 3,
      schedule: Schedule.exponential("250 millis"),
      while: (error) => isTransientCloudError(error) || error.cause instanceof DaytonaNotFoundError,
    }),
  );

/** The session endpoint's combined log contains stdout/stderr multiplexing markers. */
export const sessionOutput = (logs: {
  output?: string;
  stdout?: string;
  stderr?: string;
}): string =>
  // eslint-disable-next-line no-control-regex -- The provider's wire format uses these exact stream markers.
  (logs.output || [logs.stdout ?? "", logs.stderr ?? ""].join("")).replace(/\x01{3}|\x02{3}/g, "");

export const runChatCommand = Effect.fn("ChatCommand.run")(function* (
  sandbox: Sandbox,
  input: { command: string; cwd: string; timeoutSeconds: number },
) {
  const started = yield* Clock.currentTimeMillis;
  // Unique within a process and across restarts; this is an identity, not an access token.
  const sessionId = `ruth-${process.pid}-${started}-${yield* Effect.sync(() => ++sequence)}`;
  return yield* Effect.gen(function* () {
    // No user command has been submitted yet. Retrying session creation is safe when
    // a lost create response is followed by PROCESS_NOT_FOUND (create never arrived).
    yield* attempt("chatExecSessionCreate", () => sandbox.process.createSession(sessionId)).pipe(
      Effect.catchTag("CloudError", (error) =>
        isTransientCloudError(error) || error.cause instanceof DaytonaConflictError
          ? read("chatExecSessionRecover", () => sandbox.process.getSession(sessionId)).pipe(
              Effect.asVoid,
              Effect.catchTag("CloudError", () => Effect.fail(error)),
            )
          : Effect.fail(error),
      ),
      Effect.retry({
        times: 2,
        schedule: Schedule.exponential("500 millis"),
        while: isTransientCloudError,
      }),
    );
    // GNU timeout bounds the remote process even if the caller loses its connection.
    const command = `/bin/bash -c ${quote(`cd -- ${quote(input.cwd)} && timeout --signal=TERM --kill-after=5s ${input.timeoutSeconds}s /bin/bash -c ${quote(input.command)}`)}`;
    const submission = yield* attempt("chatExecSubmit", () =>
      sandbox.process.executeSessionCommand(sessionId, {
        command,
        runAsync: true,
        suppressInputEcho: true,
      }),
    ).pipe(
      Effect.catchTag("CloudError", (error) =>
        isTransientCloudError(error)
          ? read("chatExecRecover", () => sandbox.process.getSession(sessionId)).pipe(
              Effect.flatMap((session) => {
                const id = session.commands?.[0]?.id;
                return id ? Effect.succeed({ cmdId: id }) : Effect.fail(error);
              }),
            )
          : Effect.fail(error),
      ),
    );
    if (!submission.cmdId)
      return yield* Effect.fail(
        new CloudError({
          operation: "chatExecSubmit",
          detail: "Provider returned no command identity",
        }),
      );
    let exitCode: number;
    for (;;) {
      const status = yield* read("chatExecPoll", () =>
        sandbox.process.getSessionCommand(sessionId, submission.cmdId!),
      );
      if (typeof status.exitCode === "number") {
        exitCode = status.exitCode;
        break;
      }
      yield* Effect.sleep("200 millis");
    }
    if (
      (exitCode === 124 || exitCode === 137) &&
      (yield* Clock.currentTimeMillis) - started >= input.timeoutSeconds * 1000
    )
      return yield* Effect.fail(
        new SandboxTimeout({ operation: "exec", timeoutSeconds: input.timeoutSeconds }),
      );
    const logs = yield* read("chatExecLogs", () =>
      sandbox.process.getSessionCommandLogs(sessionId, submission.cmdId!),
    );
    return { exitCode, result: sessionOutput(logs) };
  }).pipe(
    Effect.timeoutOrElse({
      duration: `${input.timeoutSeconds + 30} seconds`,
      orElse: () =>
        Effect.fail(
          new SandboxTimeout({ operation: "exec", timeoutSeconds: input.timeoutSeconds }),
        ),
    }),
    Effect.ensuring(
      attempt("chatExecSessionDelete", () => sandbox.process.deleteSession(sessionId)).pipe(
        Effect.timeout("5 seconds"),
        Effect.catchCause(() =>
          Effect.logWarning("Chat command session cleanup failed", { sessionId }),
        ),
      ),
    ),
  );
});
