import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { GraphExtractor, GraphExtractorLive, graphRetryDelay } from "./extract.ts";
import { IngestionModels } from "../models.ts";

const apiError = (statusCode: number, message: string, responseHeaders?: Record<string, string>) =>
  new APICallError({
    message,
    statusCode,
    ...(responseHeaders ? { responseHeaders } : {}),
    url: "https://provider.test",
    requestBodyValues: {},
    isRetryable: statusCode === 429,
  });

const response = (indexes: number[], length = false) => ({
  content: [
    {
      type: "text" as const,
      text: length
        ? '{"chunks":['
        : JSON.stringify({
            chunks: indexes.map((index) => ({ index, entities: [], relations: [] })),
          }),
    },
  ],
  finishReason: { unified: length ? ("length" as const) : ("stop" as const), raw: undefined },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 10, text: 10, reasoning: 0 },
  },
  warnings: [],
});

describe("graph provider recovery", () => {
  it.effect("aborts a graph request that never returns and releases its lane", () => {
    let aborted = false;
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async ({ abortSignal }) => {
        calls++;
        if (calls > 1) return response([0]);
        return new Promise((_resolve, reject) =>
          abortSignal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("aborted"));
            },
            { once: true },
          ),
        );
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      const stalled = yield* Effect.forkChild(
        Effect.result(extractor.extract({ title: "Stalled", chunks: ["one"] })),
      );
      yield* TestClock.adjust("90 seconds");
      expect((yield* Fiber.join(stalled))._tag).toBe("Failure");
      expect(aborted).toBe(true);
      const next = yield* extractor.extract({ title: "Next", chunks: ["two"] });
      expect(next.chunks).toHaveLength(1);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it.effect("holds other files for a brief rate-limit reset and then resumes both", () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        if (calls === 1) throw apiError(429, "rate limited", { "retry-after": "39.5" });
        return response([0]);
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      const fiber = yield* Effect.forkChild(
        Effect.all(
          [
            extractor.extract({ title: "First file", chunks: ["one"] }),
            extractor.extract({ title: "Second file", chunks: ["two"] }),
          ],
          { concurrency: 2 },
        ),
      );
      yield* TestClock.adjust("39 seconds");
      expect(calls).toBe(1);
      yield* TestClock.adjust("500 millis");
      const graphs = yield* Fiber.join(fiber);
      expect(graphs).toHaveLength(2);
      expect(calls).toBe(3);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it.effect("returns long quota waits to the durable queue and frees the graph lane", () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        if (calls === 1) throw apiError(429, "tokens per day exhausted", { "retry-after": "461" });
        return response([0]);
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      const error = yield* Effect.flip(
        extractor.extract({ title: "Quota limited", chunks: ["one"] }),
      );
      expect(graphRetryDelay(error.cause, 0)).toBe(461_000);
      const next = yield* extractor.extract({ title: "Next file", chunks: ["two"] });
      expect(next.chunks).toHaveLength(1);
      expect(calls).toBe(2);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it("honors reset delays beyond the SDK's one-minute cutoff, including wrapped failures", () => {
    const failure = apiError(429, "rate limited", { "retry-after": "75.5" });
    expect(graphRetryDelay(failure, 0)).toBe(75_500);
    expect(
      graphRetryDelay(
        new RetryError({
          message: "retries exhausted",
          reason: "maxRetriesExceeded",
          errors: [failure],
        }),
        0,
      ),
    ).toBe(75_500);
    expect(graphRetryDelay(apiError(429, "rate limited", { "retry-after-ms": "39510" }), 0)).toBe(
      39_510,
    );
    expect(
      graphRetryDelay(
        apiError(429, "rate limited", { "retry-after": new Date(90_000).toUTCString() }),
        0,
      ),
    ).toBe(90_000);
    expect(graphRetryDelay(apiError(429, "rate limited"), 0)).toBe(60_000);
    expect(graphRetryDelay(apiError(401, "invalid key"), 0)).toBeUndefined();
    expect(
      graphRetryDelay(apiError(429, "Request too large on output tokens per minute"), 0),
    ).toBeUndefined();
  });

  it.effect.each(["provider", "length", "size"] as const)(
    "splits %s truncation and preserves original chunk indexes",
    (kind) => {
      let calls = 0;
      const model = new MockLanguageModelV4({
        doGenerate: async () => {
          calls++;
          if (calls === 1) {
            if (kind === "size")
              throw apiError(
                429,
                "Request too large on output tokens per minute (OTPM): Limit 1000, Requested 1305",
              );
            if (kind === "provider")
              throw apiError(
                400,
                "max completion tokens reached before generating a valid document",
              );
            return response([], true);
          }
          return response([0]);
        },
      });
      return Effect.gen(function* () {
        const extractor = yield* GraphExtractor;
        const graph = yield* extractor.extract({ title: "Study", chunks: ["first", "second"] });
        expect(graph.chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
        expect(calls).toBe(3);
        expect(model.doGenerateCalls.every((call) => call.maxOutputTokens === 4096)).toBe(true);
      }).pipe(
        Effect.provide(GraphExtractorLive),
        Effect.provideService(IngestionModels, { languageModel: () => model }),
      );
    },
  );

  it.effect("uses a bounded compact response for a single oversized chunk", () => {
    const model = new MockLanguageModelV4({
      doGenerate: async ({ maxOutputTokens }) => {
        if (maxOutputTokens !== 900)
          throw apiError(429, "Request too large on output tokens per minute");
        return response([0]);
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      yield* extractor.extract({ title: "Study", chunks: ["dense chunk"] });
      expect(model.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual([4096, 900]);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it.effect("stops when the compact response also truncates instead of cycling budgets", () => {
    const model = new MockLanguageModelV4({
      doGenerate: async ({ maxOutputTokens }) => {
        if (maxOutputTokens !== 900)
          throw apiError(429, "Request too large on output tokens per minute");
        return response([], true);
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      const result = yield* Effect.result(
        extractor.extract({ title: "Study", chunks: ["dense chunk"] }),
      );
      expect(result._tag).toBe("Failure");
      expect(model.doGenerateCalls).toHaveLength(2);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it.effect("increases the budget once for a single truncated chunk", () => {
    const model = new MockLanguageModelV4({ doGenerate: [response([], true), response([0])] });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      yield* extractor.extract({ title: "Study", chunks: ["dense chunk"] });
      expect(model.doGenerateCalls.map((call) => call.maxOutputTokens)).toEqual([4096, 6000]);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });

  it.effect("does not retry an invalid provider credential", () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(401, "invalid key");
      },
    });
    return Effect.gen(function* () {
      const extractor = yield* GraphExtractor;
      const result = yield* Effect.result(extractor.extract({ title: "Study", chunks: ["one"] }));
      expect(result._tag).toBe("Failure");
      expect(model.doGenerateCalls).toHaveLength(1);
    }).pipe(
      Effect.provide(GraphExtractorLive),
      Effect.provideService(IngestionModels, { languageModel: () => model }),
    );
  });
});
