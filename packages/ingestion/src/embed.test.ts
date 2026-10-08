import { APICallError, RetryError } from "ai";
import { describe, expect, it } from "@effect/vitest";

import { isEmbeddingRateLimit } from "./embed.ts";

describe("embedding rate-limit classification", () => {
  const apiError = (statusCode: number) =>
    new APICallError({
      message: "provider request failed",
      url: "https://api.cohere.com/v2/embed",
      requestBodyValues: {},
      statusCode,
    });

  it("retries only an AI SDK HTTP 429", () => {
    expect(isEmbeddingRateLimit(apiError(429))).toBe(true);
    expect(
      isEmbeddingRateLimit(
        new RetryError({
          message: "quick retries exhausted",
          reason: "maxRetriesExceeded",
          errors: [apiError(429)],
        }),
      ),
    ).toBe(true);
    expect(isEmbeddingRateLimit(apiError(500))).toBe(false);
    expect(
      isEmbeddingRateLimit(
        new RetryError({
          message: "quick retries exhausted",
          reason: "maxRetriesExceeded",
          errors: [apiError(429), apiError(500)],
        }),
      ),
    ).toBe(false);
    expect(isEmbeddingRateLimit(new Error("429 rate limit"))).toBe(false);
  });
});
