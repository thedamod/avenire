import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { isRetryableResendError, makeResendMailer, type ResendSend } from "./mailer.ts";

const request = {
  to: "ruth@example.test",
  template: "verify-email",
  props: { name: "Ava", url: "https://avenire.space/verify" },
} as const;

type Reply = Awaited<ReturnType<ResendSend>>;
const sentOk: Reply = { data: { id: "msg_1" }, error: null };
const failed = (statusCode: number | null, name = "internal_server_error"): Reply => ({
  data: null,
  error: { message: "boom", statusCode, name },
});

/** A Resend whose replies are scripted in order; the last one repeats. */
const scripted = (...replies: Array<Reply>) => {
  const calls: Array<Parameters<ResendSend>> = [];
  const send: ResendSend = async (...args) => {
    calls.push(args);
    return replies[Math.min(calls.length - 1, replies.length - 1)]!;
  };
  return { calls, mailer: makeResendMailer(send, "Avenire <hello@avenire.space>") };
};

describe("Resend error classification", () => {
  it("retries network trouble, rate limits and provider errors only", () => {
    expect(isRetryableResendError({ statusCode: null, name: "application_error" })).toBe(true);
    expect(isRetryableResendError({ statusCode: 429, name: "rate_limit_exceeded" })).toBe(true);
    expect(isRetryableResendError({ statusCode: 500, name: "internal_server_error" })).toBe(true);
    expect(isRetryableResendError({ statusCode: 422, name: "validation_error" })).toBe(false);
    expect(isRetryableResendError({ statusCode: 429, name: "daily_quota_exceeded" })).toBe(false);
    expect(isRetryableResendError({ statusCode: 403, name: "invalid_api_key" })).toBe(false);
  });
});

describe("Mailer over Resend", () => {
  it.effect("renders html and text, and passes the idempotency key", () =>
    Effect.gen(function* () {
      const { calls, mailer } = scripted(sentOk);
      const result = yield* mailer.send({ ...request, idempotencyKey: "verify-1" });
      expect(result).toEqual({ id: "msg_1" });
      const [payload, options] = calls[0]!;
      expect(payload).toMatchObject({
        from: "Avenire <hello@avenire.space>",
        to: "ruth@example.test",
        subject: "Confirm your Avenire email",
      });
      expect(payload.html).toContain("https://avenire.space/verify");
      expect(payload.text).toContain("Confirm email");
      expect(options).toEqual({ idempotencyKey: "verify-1" });
    }),
  );

  it.effect("retries a transient failure and succeeds", () =>
    Effect.gen(function* () {
      const { calls, mailer } = scripted(failed(503), sentOk);
      const fiber = yield* Effect.forkChild(mailer.send(request));
      yield* TestClock.adjust("5 seconds");
      expect(yield* Fiber.join(fiber)).toEqual({ id: "msg_1" });
      expect(calls).toHaveLength(2);
    }),
  );

  it.effect("gives up after three attempts on a persistent failure", () =>
    Effect.gen(function* () {
      const { calls, mailer } = scripted(failed(500));
      const fiber = yield* Effect.forkChild(Effect.flip(mailer.send(request)));
      yield* TestClock.adjust("5 seconds");
      const error = yield* Fiber.join(fiber);
      expect(error._tag).toBe("EmailSendError");
      expect(error.message).toBe("Could not send verify-email email: boom");
      expect(calls).toHaveLength(3);
    }),
  );

  it.effect("does not retry a request the provider rejected", () =>
    Effect.gen(function* () {
      const { calls, mailer } = scripted(failed(422, "validation_error"));
      yield* Effect.flip(mailer.send(request));
      expect(calls).toHaveLength(1);
    }),
  );
});
