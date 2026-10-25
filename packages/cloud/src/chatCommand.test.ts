import {
  DaytonaConnectionError,
  DaytonaBadRequestError,
  DaytonaNotFoundError,
  type Sandbox,
} from "@daytonaio/sdk";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { runChatCommand, sessionOutput } from "./chatCommand.ts";

const fixture = (drop?: string) => {
  const seen = new Set<string>();
  const submitted: string[] = [];
  let creates = 0;
  const sessions = new Map<string, { id: string; command: string }[]>();
  const deleted: string[] = [];
  const fail = (stage: string) => {
    if (stage === drop && !seen.has(stage)) {
      seen.add(stage);
      throw new DaytonaConnectionError("lost response");
    }
  };
  const sandbox = {
    process: {
      async createSession(id: string) {
        creates++;
        if (drop === "create-never-accepted" || (drop === "create-not-accepted" && creates === 1))
          throw new DaytonaConnectionError("request never arrived");
        sessions.set(id, []);
        fail("create");
      },
      async getSession(id: string) {
        if (!sessions.has(id)) throw new DaytonaNotFoundError("session not found", 404);
        return { sessionId: id, commands: sessions.get(id) ?? [] };
      },
      async executeSessionCommand(id: string, request: { command: string }) {
        submitted.push(request.command);
        if (drop === "reject") throw new DaytonaBadRequestError("invalid request", 400);
        if (drop === "not-accepted") throw new DaytonaConnectionError("unknown acceptance");
        const command = { id: `command-${submitted.length}`, command: request.command };
        sessions.get(id)!.push(command);
        fail("submit");
        return { cmdId: command.id };
      },
      async getSessionCommand(_session: string, id: string) {
        fail("poll");
        return {
          id,
          command: "",
          ...(drop === "pending" ? {} : { exitCode: drop === "nonzero" ? 7 : 0 }),
        };
      },
      async getSessionCommandLogs() {
        fail("logs");
        return { output: "one execution\n" };
      },
      async deleteSession(id: string) {
        deleted.push(id);
        sessions.delete(id);
      },
    },
  } as unknown as Sandbox;
  return { sandbox, submitted, deleted, creates: () => creates };
};
const input = {
  command: "printf '%s' \"hello\"\nexit 0",
  cwd: "/home/daytona/work/it's a directory",
  timeoutSeconds: 30,
};
it("decodes combined session logs and falls back to split logs", () => {
  expect(
    sessionOutput({
      output: "\x01\x01\x01hello π\n\x02\x02\x02problem\n",
      stdout: "hello π\n",
      stderr: "problem\n",
    }),
  ).toBe("hello π\nproblem\n");
  expect(sessionOutput({ output: "", stdout: "hello", stderr: "problem" })).toBe("helloproblem");
});
for (const stage of ["create", "submit", "poll", "logs"])
  it.effect(`recovers a lost ${stage} response without submitting the command twice`, () => {
    const f = fixture(stage);
    return Effect.gen(function* () {
      const task = yield* Effect.forkChild(runChatCommand(f.sandbox, input));
      yield* TestClock.adjust("5 seconds");
      expect(yield* Fiber.join(task)).toEqual({ exitCode: 0, result: "one execution\n" });
      expect(f.submitted).toHaveLength(1);
      expect(f.deleted).toHaveLength(1);
    });
  });
for (const stage of ["reject", "not-accepted"])
  it.effect(`does not rerun a ${stage} submission`, () => {
    const f = fixture(stage);
    return Effect.gen(function* () {
      expect(yield* runChatCommand(f.sandbox, input).pipe(Effect.result)).toMatchObject({
        failure: { _tag: "CloudError" },
      });
      expect(f.submitted).toHaveLength(1);
      expect(f.deleted).toHaveLength(1);
    });
  });
it.effect("returns nonzero exit codes as command results", () => {
  const f = fixture("nonzero");
  return Effect.gen(function* () {
    expect(yield* runChatCommand(f.sandbox, input)).toMatchObject({ exitCode: 7 });
  });
});
it.effect("bounds a pending command and cleans its session", () => {
  const f = fixture("pending");
  return Effect.gen(function* () {
    const task = yield* Effect.forkChild(
      runChatCommand(f.sandbox, { ...input, timeoutSeconds: 1 }).pipe(Effect.result),
    );
    yield* TestClock.adjust("32 seconds");
    expect(yield* Fiber.join(task)).toMatchObject({
      failure: { _tag: "SandboxTimeout", operation: "exec" },
    });
    expect(f.submitted).toHaveLength(1);
    expect(f.deleted).toHaveLength(1);
  });
});
it.effect("isolates concurrent command sessions", () => {
  const f = fixture();
  return Effect.gen(function* () {
    yield* Effect.all([runChatCommand(f.sandbox, input), runChatCommand(f.sandbox, input)], {
      concurrency: "unbounded",
    });
    expect(new Set(f.deleted).size).toBe(2);
    expect(f.submitted).toHaveLength(2);
  });
});

it.effect("retries an unaccepted session creation before submitting exactly one command", () => {
  const f = fixture("create-not-accepted");
  return Effect.gen(function* () {
    const task = yield* Effect.forkChild(runChatCommand(f.sandbox, input));
    yield* TestClock.adjust("10 seconds");
    expect(yield* Fiber.join(task)).toEqual({ exitCode: 0, result: "one execution\n" });
    expect(f.creates()).toBe(2);
    expect(f.submitted).toHaveLength(1);
    expect(f.deleted).toHaveLength(1);
  });
});
it.effect("bounds session creation failures without submitting a user command", () => {
  const f = fixture("create-never-accepted");
  return Effect.gen(function* () {
    const task = yield* Effect.forkChild(runChatCommand(f.sandbox, input).pipe(Effect.result));
    yield* TestClock.adjust("20 seconds");
    expect(yield* Fiber.join(task)).toMatchObject({
      failure: { _tag: "CloudError", operation: "chatExecSessionCreate" },
    });
    expect(f.creates()).toBe(3);
    expect(f.submitted).toHaveLength(0);
    expect(f.deleted).toHaveLength(1);
  });
});
