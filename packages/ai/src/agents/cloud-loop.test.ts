import { expect, it } from "@effect/vitest";
import { jsonSchema, tool, type UIMessageChunk } from "ai";
import { CloudRunId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { AnalyticsNoop } from "@avenire/shared/observability";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CONTINUE_PROMPT,
  pendingToolCalls,
  runCloudLoop,
  stepOutcome,
  type LoopCheckpoint,
  stepCost,
} from "./cloud-loop.ts";
import { scriptedModel } from "./conformance.ts";
import { createImageTransport } from "../tools/images.ts";
import { toAiSdkTools } from "../tools/ai-sdk.ts";
import { registerTool } from "../tools/registration.ts";
import { withToolJournal } from "../cloud/journal.ts";
import { recordingDatabase } from "../cloud-test-support.ts";
import { ctx } from "../tools/test-support.ts";
import type { RuthKitServices } from "../tools/library.ts";
class SimulatedCrash extends Schema.TaggedError<SimulatedCrash>()("SimulatedCrash", {}) {}
const idle = {
  check: () => Effect.void,
  save: () => Effect.void,
  emit: () => Effect.void,
};
it.effect(
  "streams each step's chunks and continues sandbox work past 500 checkpointed steps",
  () => {
    let executed = 0;
    const model = scriptedModel([
      ...[1, 2, 3].map((n) => ({
        toolCalls: [{ id: `work-${n}`, name: "box_exec", input: "{}" }],
      })),
      { text: "Finished sandbox work." },
    ]);
    const capabilities = { vision: false, toolResultImages: false };
    const chunks: UIMessageChunk[] = [];
    return Effect.gen(function* () {
      const result = yield* runCloudLoop({
        model,
        system: "Finish the work",
        tools: {
          box_exec: tool({
            inputSchema: jsonSchema<Record<string, never>>({ type: "object", properties: {} }),
            execute: async () => ({ executed: ++executed }),
          }),
        },
        images: createImageTransport(capabilities),
        capabilities,
        checkpoint: {
          messages: [{ role: "user", content: "Continue" }],
          stepIndex: 501,
          usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
        },
        deadline: 100000,
        maxCost: 1,
        maxActions: 10,
        ...idle,
        emit: (batch) =>
          Effect.sync(() => {
            chunks.push(...batch);
          }),
      });
      expect(result.text).toBe("Finished sandbox work.");
      expect(result.checkpoint.stepIndex).toBe(505);
      expect(executed).toBe(3);
      expect(model.doStreamCalls).toHaveLength(4);
      const types = chunks.map((chunk) => chunk.type);
      // Steps stream as start-step..finish-step; the executor owns the run's start and finish.
      expect(types).not.toContain("start");
      expect(types).not.toContain("finish");
      expect(types.filter((type) => type === "start-step")).toHaveLength(4);
      expect(types.filter((type) => type === "finish-step")).toHaveLength(4);
      expect(types).toContain("tool-input-available");
      expect(chunks.filter((c) => c.type === "tool-output-available")).toMatchObject([
        { toolCallId: "work-1", output: { executed: 1 } },
        { toolCallId: "work-2" },
        { toolCallId: "work-3" },
      ]);
      expect(chunks.filter((c) => c.type === "text-delta")).toMatchObject([
        { delta: "Finished sandbox work." },
      ]);
    });
  },
);
it("prices steps a provider reports no cost for, and prefers a reported cost", () => {
  const usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    inputTokenDetails: { cacheReadTokens: 500_000 },
  };
  const pricing = { input: 0.15, cachedInput: 0.03, output: 0.5 };
  expect(stepCost({ usage } as never, pricing)).toBeCloseTo(0.075 + 0.015 + 0.5);
  expect(
    stepCost({ usage, metadata: { openrouter: { usage: { cost: 0.2 } } } } as never, pricing),
  ).toBe(0.2);
  expect(stepCost({ usage } as never, undefined)).toBe(0);
});

it("maps every finish reason to one outcome", () => {
  const outcome = (finishReason: Parameters<typeof stepOutcome>[0]["finishReason"], extra = {}) =>
    stepOutcome({ finishReason, pendingTools: false, continuations: 0, ...extra });
  expect(outcome("tool-calls")).toEqual({ action: "run-tools" });
  expect(outcome("stop")).toEqual({ action: "finish" });
  expect(outcome("length")).toEqual({ action: "continue" });
  expect(outcome("length", { continuations: 2 })).toMatchObject({
    action: "fail",
    retryable: false,
  });
  expect(outcome("length", { pendingTools: true })).toEqual({ action: "run-tools" });
  expect(outcome("content-filter")).toMatchObject({ action: "fail", retryable: false });
  expect(outcome("error")).toMatchObject({ action: "fail", retryable: true });
  expect(outcome("other", { rawFinishReason: "weird" })).toMatchObject({
    action: "fail",
    reason: expect.stringContaining("weird"),
  });
});
it.effect("asks a cut-off answer to continue, and fails if it keeps being cut off", () => {
  const capabilities = { vision: false, toolResultImages: false };
  const run = (model: ReturnType<typeof scriptedModel>) =>
    runCloudLoop({
      model,
      system: "Answer",
      tools: {},
      images: createImageTransport(capabilities),
      capabilities,
      checkpoint: {
        messages: [{ role: "user", content: "Write it" }],
        stepIndex: 0,
        usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
      },
      deadline: 100000,
      maxCost: 1,
      maxActions: 10,
      ...idle,
    });
  return Effect.gen(function* () {
    const model = scriptedModel([
      { text: "First half", finish: "length" },
      { text: " and the rest." },
    ]);
    const done = yield* run(model);
    expect(done.text).toBe(" and the rest.");
    expect(model.doStreamCalls[1]!.prompt.at(-1)).toMatchObject({
      role: "user",
      content: [{ type: "text", text: CONTINUE_PROMPT }],
    });
    const cutOff = yield* Effect.flip(run(scriptedModel([{ text: "x", finish: "length" }])));
    expect(cutOff).toMatchObject({ retryable: false, reason: expect.stringContaining("cut off") });
    const filtered = yield* Effect.flip(run(scriptedModel([{ finish: "content-filter" }])));
    expect(filtered.reason).toContain("content filter");
  });
});
it.effect(
  "resumes after crash between publish completion and checkpoint without duplicate hydrate/publish",
  () => {
    const db = recordingDatabase();
    let hydrated = 0;
    let published = 0;
    const policy = { agents: ["ruth-cloud"], approval: "never" } as const;
    const spec = (name: string) => ({
      name,
      description: name,
      inputSchema: Schema.Struct({}),
      outputSchema: Schema.Struct({ completed: Schema.Boolean }),
    });
    const registry = withToolJournal({
      hydrate_files: registerTool({
        spec: spec("hydrate_files"),
        policy,
        execute: () =>
          Effect.sync(() => {
            hydrated++;
            return { completed: true };
          }),
      }),
      publish_output: registerTool({
        spec: spec("publish_output"),
        policy,
        execute: () =>
          Effect.sync(() => {
            published++;
            return { completed: true };
          }),
      }),
    });
    const model = scriptedModel([
      {
        toolCalls: [
          { id: "hydrate-1", name: "hydrate_files", input: "{}" },
          { id: "publish-1", name: "publish_output", input: "{}" },
        ],
      },
      { text: "Done" },
    ]);
    let persisted: LoopCheckpoint = {
      messages: [{ role: "user", content: "Work" }],
      stepIndex: 0,
      usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
    };
    const capabilities = { vision: true, toolResultImages: true };
    const cloudCtx = { ...ctx, agent: "ruth-cloud" as const, runId: CloudRunId.make("run") };
    let crash = true;
    return Effect.gen(function* () {
      const services = (yield* Effect.context<
        Database | import("@avenire/shared/observability").Analytics
      >()) as Context.Context<Database | RuthKitServices>;
      const makeLoop = () => {
        const images = createImageTransport(capabilities, 1);
        const { tools } = toAiSdkTools<Database>(
          Object.keys(registry),
          cloudCtx,
          services,
          registry,
          images,
        );
        return runCloudLoop({
          model,
          system: "Test",
          tools,
          images,
          capabilities,
          checkpoint: persisted,

          maxActions: 10,
          maxCost: 1,
          deadline: 100000,
          check: () => Effect.void,
          emit: () => Effect.void,
          save: (checkpoint) =>
            Effect.gen(function* () {
              if (
                crash &&
                !pendingToolCalls(checkpoint.messages).length &&
                checkpoint.stepIndex === 1
              ) {
                crash = false;
                return yield* new SimulatedCrash({});
              }
              persisted = structuredClone(checkpoint);
            }),
        });
      };
      expect((yield* Effect.result(makeLoop()))._tag).toBe("Failure");
      expect(hydrated).toBe(1);
      expect(published).toBe(1);
      expect(pendingToolCalls(persisted.messages).map((c) => c.toolCallId)).toEqual(["publish-1"]);
      const resumed = yield* makeLoop();
      expect(resumed.text).toBe("Done");
      expect(hydrated).toBe(1);
      expect(published).toBe(1);
      expect(db.rows("cloud_tool_call").filter((r) => r.status === "completed")).toHaveLength(2);
      expect(model.doStreamCalls).toHaveLength(2);
      expect(persisted.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 });
    }).pipe(Effect.provideService(Database, db.database), Effect.provide(AnalyticsNoop));
  },
);

it.effect("halts on a failed journal write while preserving the unresolved publication", () => {
  const db = recordingDatabase();
  let failWrite = false;
  const database = Database.of({
    ...db.database,
    use: (fn) =>
      failWrite
        ? Effect.fail(new DatabaseError({ cause: "simulated journal outage" }))
        : db.database.use(fn),
  });
  const policy = { agents: ["ruth-cloud"], approval: "never" } as const;
  const registry = withToolJournal({
    publish_output: registerTool({
      spec: {
        name: "publish_output",
        description: "Publish",
        inputSchema: Schema.Struct({}),
        outputSchema: Schema.Struct({ completed: Schema.Boolean }),
      },
      policy,
      execute: () =>
        Effect.sync(() => {
          failWrite = true;
          return { completed: true };
        }),
    }),
  });
  const model = scriptedModel([{ toolCalls: [{ id: "p", name: "publish_output", input: "{}" }] }]);
  let persisted: LoopCheckpoint = {
    messages: [{ role: "user", content: "Work" }],
    stepIndex: 0,
    usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
  };
  return Effect.gen(function* () {
    const services = (yield* Effect.context<
      Database | import("@avenire/shared/observability").Analytics
    >()) as Context.Context<Database | RuthKitServices>;
    const capabilities = { vision: true, toolResultImages: true };
    const images = createImageTransport(capabilities);
    const { tools } = toAiSdkTools<Database>(
      ["publish_output"],
      { ...ctx, agent: "ruth-cloud", runId: CloudRunId.make("run") },
      services,
      registry,
      images,
    );
    const result = yield* Effect.result(
      runCloudLoop({
        model,
        system: "Test",
        tools,
        images,
        capabilities,
        checkpoint: persisted,

        maxActions: 10,
        maxCost: 1,
        deadline: 100000,
        check: () => Effect.void,
        emit: () => Effect.void,
        save: (state) =>
          Effect.sync(() => {
            persisted = structuredClone(state);
          }),
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure.retryable).toBe(true);
    expect(pendingToolCalls(persisted.messages).map((c) => c.toolCallId)).toEqual(["p"]);
    expect(model.doStreamCalls).toHaveLength(1);
  }).pipe(Effect.provideService(Database, database), Effect.provide(AnalyticsNoop));
});

for (const mode of ["stop", "publish_report"] as const) {
  it.effect(`replays ${mode} final checkpoint twice with zero further model or tool calls`, () => {
    const model = scriptedModel(
      mode === "stop"
        ? [{ text: "Final answer", finish: "stop" }]
        : [
            {
              toolCalls: [
                { id: "report", name: "publish_report", input: '{"markdown":"Final answer"}' },
              ],
            },
          ],
    );
    const capabilities = { vision: false, toolResultImages: false };
    let calls = 0;
    let persisted: LoopCheckpoint = {
      messages: [{ role: "user", content: "Finish" }],
      stepIndex: 0,
      usage: { inputTokens: 0, outputTokens: 0, cost: 0, actions: 0 },
    };
    let crash = true;
    const execute = () =>
      runCloudLoop({
        model,
        system: "Finish",
        capabilities,
        images: createImageTransport(capabilities),
        tools: {
          publish_report: tool({
            inputSchema: jsonSchema<{ markdown: string }>({
              type: "object",
              properties: { markdown: { type: "string" } },
              required: ["markdown"],
            }),
            execute: async () => {
              calls++;
              return { saved: true };
            },
          }),
        },
        checkpoint: structuredClone(persisted),
        deadline: persisted.usage.execution ? -1 : 100000,
        maxCost: 1,
        maxActions: 10,
        ...idle,
        save: (state) =>
          Effect.gen(function* () {
            persisted = structuredClone(state);
            if (crash && persisted.usage.execution) {
              crash = false;
              return yield* new SimulatedCrash({});
            }
          }),
      });
    return Effect.gen(function* () {
      expect((yield* Effect.result(execute()))._tag).toBe("Failure");
      expect(persisted.usage.execution).toEqual({ status: "completed", text: "Final answer" });
      expect((yield* execute()).text).toBe("Final answer");
      expect((yield* execute()).text).toBe("Final answer");
      expect(model.doStreamCalls).toHaveLength(1);
      expect(calls).toBe(mode === "stop" ? 0 : 1);
    });
  });
}
