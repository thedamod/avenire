import {
  generateText,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
  type LanguageModel,
  type ToolCallPart,
  type ToolResultPart,
  type ToolExecutionOptions,
} from "ai";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { imageModelOutput, type ImageTransport } from "../tools/images.ts";
import { RuthToolError } from "../tools/core.ts";
import type { ModelCapabilities } from "../models/index.ts";

export class CloudLoopError extends Schema.TaggedError<CloudLoopError>()("CloudLoopError", {
  reason: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  retryable: Schema.optionalKey(Schema.Boolean),
}) {}
export interface LoopCheckpoint {
  messages: ModelMessage[];
  stepIndex: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    actions: number;
    boxMetered?: boolean;
    cleanupComplete?: boolean;
    resumeFailures?: number;
  };
}
export const pendingToolCalls = (messages: readonly ModelMessage[]): ToolCallPart[] => {
  const calls = new Map<string, ToolCallPart>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content))
      for (const p of m.content) if (p.type === "tool-call") calls.set(p.toolCallId, p);
    if (m.role === "tool")
      for (const p of m.content) if (p.type === "tool-result") calls.delete(p.toolCallId);
  }
  return Array.from(calls.values());
};
/** SDK/provider usage metadata has varied shapes; only measured nonnegative cost is counted. */
export const openRouterCost = (metadata: unknown): number => {
  if (!metadata || typeof metadata !== "object") return 0;
  const record = metadata as Record<string, unknown>;
  for (const key of ["cost", "totalCost", "total_cost"])
    if (typeof record[key] === "number" && Number.isFinite(record[key]) && record[key] >= 0)
      return record[key];
  return Object.values(record).reduce<number>((sum, child) => sum + openRouterCost(child), 0);
};
/** One model step at a time: commit assistant intent before tool execution, then commit
 * each result. The same AI SDK schemas/adapter/policy as chat execute these tools. */
export const runCloudLoop = Effect.fn("RuthCloud.loop")(function* <E, R>(options: {
  model: LanguageModel;
  system: string;
  tools: ToolSet;
  images: ImageTransport;
  capabilities: ModelCapabilities;
  checkpoint: LoopCheckpoint;
  maxSteps: number;
  deadline: number;
  maxCost: number;
  maxActions: number;
  check: () => Effect.Effect<void, E, R>;
  save: (checkpoint: LoopCheckpoint) => Effect.Effect<void, E, R>;
}) {
  let state: LoopCheckpoint = Object.assign({}, options.checkpoint, {
    messages: options.checkpoint.messages.slice(),
  });
  const definitions: ToolSet = Object.fromEntries(
    Object.entries(options.tools).map(([name, tool]) => {
      const { execute: _execute, ...definition } = tool;
      return [name, definition];
    }),
  );
  while (true) {
    yield* options.check();
    if ((yield* Clock.currentTimeMillis) >= options.deadline)
      return yield* new CloudLoopError({
        reason: "The run exceeded its four-hour wall-clock limit.",
      });
    const pending = pendingToolCalls(state.messages);
    let completedReport: string | undefined;
    for (const call of pending) {
      yield* options.check();
      if ((yield* Clock.currentTimeMillis) >= options.deadline)
        return yield* new CloudLoopError({
          reason: "The run exceeded its four-hour wall-clock limit.",
        });
      const tool = options.tools[call.toolName];
      if (!tool?.execute)
        return yield* new CloudLoopError({ reason: `Unregistered tool ${call.toolName}.` });
      const result = yield* Effect.tryPromise({
        try: async (signal) =>
          (
            tool.execute as (
              input: unknown,
              options: ToolExecutionOptions<unknown>,
            ) => Promise<unknown>
          )(call.input, {
            toolCallId: call.toolCallId,
            messages: state.messages,
            abortSignal: signal,
            context: undefined,
          }),
        catch: (cause) =>
          new CloudLoopError({
            reason: `Tool ${call.toolName} failed.`,
            cause,
            retryable: cause instanceof RuthToolError && cause.checkpointFatal === true,
          }),
      }).pipe(Effect.result);
      if (result._tag === "Failure" && result.failure.retryable) return yield* result.failure;
      const output: ToolResultPart["output"] =
        result._tag === "Success"
          ? imageModelOutput(result.success, options.capabilities)
          : { type: "error-text", value: result.failure.reason };
      if (result._tag === "Success") options.images.attach(result.success);
      if (
        result._tag === "Success" &&
        call.toolName === "publish_report" &&
        typeof call.input === "object" &&
        call.input !== null &&
        "markdown" in call.input &&
        typeof call.input.markdown === "string"
      )
        completedReport = call.input.markdown;
      if (call.toolName === "computer")
        state.usage = { ...state.usage, actions: state.usage.actions + 1 };
      state = Object.assign({}, state, {
        messages: [
          ...state.messages,
          {
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output,
              },
            ],
          },
        ],
      });
      yield* options.save(state);
    }
    if (completedReport !== undefined) return { checkpoint: state, text: completedReport };
    if (
      state.stepIndex >= options.maxSteps ||
      state.usage.cost >= options.maxCost ||
      state.usage.actions >= options.maxActions
    )
      return yield* new CloudLoopError({
        reason: "The model step, spend or action budget is exhausted.",
      });
    state = Object.assign({}, state, { messages: options.images.prepareMessages(state.messages) });
    yield* options.save(state);
    const result = yield* Effect.tryPromise({
      try: (signal) =>
        generateText({
          model: options.model,
          system: options.system,
          tools: definitions,
          messages: state.messages,
          abortSignal: signal,
          stopWhen: stepCountIs(1),
          prepareStep: ({ messages }) => ({ messages: options.images.prepareMessages(messages) }),
          providerOptions: { openrouter: { parallel_tool_calls: false, usage: { include: true } } },
        }),
      catch: (cause) =>
        new CloudLoopError({ reason: "The server model request failed.", cause, retryable: true }),
    });
    state = Object.assign({}, state, {
      messages: [...state.messages, ...result.response.messages],
      stepIndex: state.stepIndex + 1,
      usage: {
        ...state.usage,
        inputTokens: state.usage.inputTokens + (result.totalUsage.inputTokens ?? 0),
        outputTokens: state.usage.outputTokens + (result.totalUsage.outputTokens ?? 0),
        cost: state.usage.cost + openRouterCost(result.providerMetadata),
      },
    });
    yield* options.save(state);
    if (!pendingToolCalls(state.messages).length) return { checkpoint: state, text: result.text };
  }
});
