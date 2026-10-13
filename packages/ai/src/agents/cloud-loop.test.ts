import { expect, it } from "@effect/vitest";
import { MockLanguageModelV4 } from "ai/test";
import { jsonSchema, tool } from "ai";
import { CloudRunId } from "@avenire/contracts";
import { Database, DatabaseError } from "@avenire/database/client";
import { AnalyticsNoop } from "@avenire/shared/observability";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { runCloudLoop, pendingToolCalls, type LoopCheckpoint } from "./cloud-loop.ts";
import { createImageTransport } from "../tools/images.ts";
import { toAiSdkTools } from "../tools/ai-sdk.ts";
import { registerTool } from "../tools/registration.ts";
import { withToolJournal } from "../cloud/journal.ts";
import { recordingDatabase } from "../cloud-test-support.ts";
import { ctx } from "../tools/test-support.ts";
import type { RuthKitServices } from "../tools/library.ts";
class SimulatedCrash extends Schema.TaggedError<SimulatedCrash>()("SimulatedCrash", {}) {}
const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
it.effect("continues sandbox work past 500 checkpointed steps and finishes naturally", () => {
  let next = 0;
  let executed = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content:
        next++ < 3
          ? [
              {
                type: "tool-call" as const,
                toolName: "box_exec",
                toolCallId: `work-${next}`,
                input: "{}",
              },
            ]
          : [{ type: "text" as const, text: "Finished sandbox work." }],
      usage,
      finishReason: {
        unified: next <= 3 ? ("tool-calls" as const) : ("stop" as const),
        raw: next <= 3 ? "tool_calls" : "stop",
      },
      warnings: [],
    }),
  });
  const capabilities = { vision: false, toolResultImages: false };
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
      check: () => Effect.void,
      save: () => Effect.void,
    });
    expect(result.text).toBe("Finished sandbox work.");
    expect(result.checkpoint.stepIndex).toBe(505);
    expect(executed).toBe(3);
    expect(model.doGenerateCalls).toHaveLength(4);
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
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            { type: "tool-call", toolName: "hydrate_files", toolCallId: "hydrate-1", input: "{}" },
            { type: "tool-call", toolName: "publish_output", toolCallId: "publish-1", input: "{}" },
          ],
          usage,
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          warnings: [],
        },
        {
          content: [{ type: "text", text: "Done" }],
          usage,
          finishReason: { unified: "stop", raw: "stop" },
          warnings: [],
        },
      ],
    });
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
      expect(model.doGenerateCalls).toHaveLength(2);
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
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "tool-call", toolName: "publish_output", toolCallId: "p", input: "{}" }],
      usage,
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      warnings: [],
    },
  });
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
        save: (state) =>
          Effect.sync(() => {
            persisted = structuredClone(state);
          }),
      }),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure.retryable).toBe(true);
    expect(pendingToolCalls(persisted.messages).map((c) => c.toolCallId)).toEqual(["p"]);
    expect(model.doGenerateCalls).toHaveLength(1);
  }).pipe(Effect.provideService(Database, database), Effect.provide(AnalyticsNoop));
});
