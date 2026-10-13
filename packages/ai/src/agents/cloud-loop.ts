import {
  stepCountIs,
  streamText,
  toUIMessageStream,
  type FinishReason,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolCallPart,
  type ToolExecutionOptions,
  type ToolResultPart,
  type ToolSet,
  type UIMessageChunk,
} from "ai";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { imageInResult, imageModelOutput, type ImageTransport } from "../tools/images.ts";
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

/** A step's cost: what the provider reported, else an estimate from the model's list price, so the
 * spend cap holds for providers that report none (Fireworks). */
export const stepCost = (
  step: { readonly metadata?: unknown; readonly usage: LanguageModelUsage },
  pricing: ModelCapabilities["pricing"],
): number => {
  const reported = openRouterCost(step.metadata);
  if (reported > 0 || !pricing) return reported;
  const input = step.usage.inputTokens ?? 0;
  const cached = Math.min(input, step.usage.inputTokenDetails?.cacheReadTokens ?? 0);
  const output = step.usage.outputTokens ?? 0;
  return (
    ((input - cached) * pricing.input + cached * pricing.cachedInput + output * pricing.output) /
    1e6
  );
};

/** How many times in a row a cut-off answer may be continued before the run fails. */
export const MAX_LENGTH_CONTINUATIONS = 2;
export const CONTINUE_PROMPT =
  "Your last response was cut off at the output length limit. Continue exactly where you left off, and keep the rest shorter.";

/** What the loop does after a step, by the model's finish reason. */
export type StepOutcome =
  | { readonly action: "run-tools" }
  | { readonly action: "finish" }
  | { readonly action: "continue" }
  | { readonly action: "fail"; readonly reason: string; readonly retryable: boolean };
export const stepOutcome = (input: {
  finishReason: FinishReason;
  rawFinishReason?: string | undefined;
  pendingTools: boolean;
  continuations: number;
}): StepOutcome => {
  switch (input.finishReason) {
    case "tool-calls":
      return { action: "run-tools" };
    case "stop":
      return input.pendingTools ? { action: "run-tools" } : { action: "finish" };
    case "length":
      if (input.pendingTools) return { action: "run-tools" };
      return input.continuations < MAX_LENGTH_CONTINUATIONS
        ? { action: "continue" }
        : {
            action: "fail",
            reason: "The model's answer was cut off at the length limit repeatedly.",
            retryable: false,
          };
    case "content-filter":
      return {
        action: "fail",
        reason: "The provider's content filter stopped the model's response.",
        retryable: false,
      };
    case "error":
      // A mid-stream provider failure is transient: the same step may be resumed within the task's retry allowance.
      return { action: "fail", reason: "The model stopped on a provider error.", retryable: true };
    default:
      return {
        action: "fail",
        reason: `The model stopped for an unrecognised reason (${input.rawFinishReason ?? input.finishReason}).`,
        retryable: false,
      };
  }
};

/** Event-log copy of a tool result: screenshot bytes stay in the model transport, not in Postgres. */
export const eventOutput = (output: unknown): unknown => {
  const image = imageInResult(output);
  return image && typeof output === "object" && output !== null
    ? { ...output, screenshot: { ...image, data: "" } }
    : output;
};

/** One model step at a time, streamed: commit assistant intent before tool execution, then commit
 * each result. The same AI SDK schemas/adapter/policy as chat execute these tools; every step's
 * UI message chunks (plus tool results the loop executes) go to `emit` in batches. */
export const runCloudLoop = Effect.fn("RuthCloud.loop")(function* <E, R>(options: {
  model: LanguageModel;
  system: string;
  tools: ToolSet;
  images: ImageTransport;
  capabilities: ModelCapabilities;
  checkpoint: LoopCheckpoint;
  deadline: number;
  maxCost: number;
  maxActions: number;
  check: () => Effect.Effect<void, E, R>;
  save: (checkpoint: LoopCheckpoint) => Effect.Effect<void, E, R>;
  emit: (chunks: ReadonlyArray<UIMessageChunk>) => Effect.Effect<void, E, R>;
}) {
  let state: LoopCheckpoint = Object.assign({}, options.checkpoint, {
    messages: options.checkpoint.messages.slice(),
  });
  let continuations = 0;
  const definitions: ToolSet = Object.fromEntries(
    Object.entries(options.tools).map(([name, tool]) => {
      const { execute: _execute, ...definition } = tool;
      return [name, definition];
    }),
  );
  const modelFailure = (cause: unknown) =>
    new CloudLoopError({ reason: "The server model request failed.", cause, retryable: true });
  /** One streamed AI SDK step: tools carry no `execute`, so it stops at the tool calls. */
  const modelStep = Effect.fn("RuthCloud.modelStep")(function* (messages: ModelMessage[]) {
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => new AbortController()),
      (controller) =>
        Effect.gen(function* () {
          let streamError: unknown;
          const result = streamText({
            model: options.model,
            system: options.system,
            tools: definitions,
            messages,
            abortSignal: controller.signal,
            stopWhen: stepCountIs(1),
            prepareStep: ({ messages: current }) => ({
              messages: options.images.prepareMessages(current),
            }),
            // Errors surface as stream parts and rejected promises; the SDK default logs to the console.
            onError: ({ error }) => {
              streamError = error;
            },
          });
          const chunks = toUIMessageStream({
            stream: result.stream,
            tools: definitions,
            // The executor owns the run-level start/finish; each step is a start-step..finish-step pair.
            sendStart: false,
            sendFinish: false,
            onError: () => "The model request failed.",
          });
          yield* Stream.fromReadableStream({ evaluate: () => chunks, onError: modelFailure }).pipe(
            Stream.groupedWithin(64, "250 millis"),
            Stream.runForEach((batch) => options.emit(batch)),
          );
          const [response, finishReason, rawFinishReason, usage, metadata, text] =
            yield* Effect.tryPromise({
              try: () =>
                Promise.all([
                  result.response,
                  result.finishReason,
                  result.rawFinishReason,
                  result.totalUsage,
                  result.providerMetadata,
                  result.text,
                ]),
              catch: modelFailure,
            });
          return { response, finishReason, rawFinishReason, usage, metadata, text, streamError };
        }),
      (controller) => Effect.sync(() => controller.abort()),
    );
  });
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
      yield* options.emit([
        result._tag === "Success"
          ? {
              type: "tool-output-available",
              toolCallId: call.toolCallId,
              output: eventOutput(result.success),
            }
          : {
              type: "tool-output-error",
              toolCallId: call.toolCallId,
              errorText: result.failure.reason,
            },
      ]);
    }
    if (completedReport !== undefined) return { checkpoint: state, text: completedReport };
    if (state.usage.cost >= options.maxCost || state.usage.actions >= options.maxActions)
      return yield* new CloudLoopError({
        reason: "The spend or action budget is exhausted.",
      });
    state = Object.assign({}, state, { messages: options.images.prepareMessages(state.messages) });
    yield* options.save(state);
    const step = yield* modelStep(state.messages);
    state = Object.assign({}, state, {
      messages: [...state.messages, ...step.response.messages],
      stepIndex: state.stepIndex + 1,
      usage: {
        ...state.usage,
        inputTokens: state.usage.inputTokens + (step.usage.inputTokens ?? 0),
        outputTokens: state.usage.outputTokens + (step.usage.outputTokens ?? 0),
        cost: state.usage.cost + stepCost(step, options.capabilities.pricing),
      },
    });
    yield* options.save(state);
    const outcome = stepOutcome({
      finishReason: step.finishReason,
      rawFinishReason: step.rawFinishReason,
      pendingTools: pendingToolCalls(state.messages).length > 0,
      continuations,
    });
    continuations = outcome.action === "continue" ? continuations + 1 : 0;
    if (outcome.action === "finish") return { checkpoint: state, text: step.text };
    if (outcome.action === "fail")
      return yield* new CloudLoopError({
        reason: outcome.reason,
        retryable: outcome.retryable,
        ...(step.streamError === undefined ? {} : { cause: step.streamError }),
      });
    if (outcome.action === "continue") {
      state = Object.assign({}, state, {
        messages: [...state.messages, { role: "user" as const, content: CONTINUE_PROMPT }],
      });
      yield* options.save(state);
    }
  }
});
