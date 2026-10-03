import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { backoffMinutes, nextState } from "./outbox.ts";

describe("email outbox retry policy", () => {
  it.effect("uses exponential minute backoff", () =>
    Effect.sync(() => {
      expect(backoffMinutes(1)).toBe(2);
      expect(backoffMinutes(2)).toBe(4);
      expect(backoffMinutes(5)).toBe(32);
    }),
  );

  it.effect("requeues before the attempt limit", () =>
    Effect.sync(() => {
      expect(nextState(4, "temporary")).toEqual({
        status: "pending",
        lastError: "temporary",
        backoffMinutes: 16,
      });
    }),
  );

  it.effect("fails permanently at the attempt limit", () =>
    Effect.sync(() => {
      expect(nextState(5, "permanent")).toEqual({ status: "failed", lastError: "permanent" });
    }),
  );
});
