import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Cause from "effect/Cause";
import { failureReason, providerRetryDelay, startIngestionLanes, wakesWorker } from "./worker.ts";
import { IngestionError } from "./pipeline.ts";
import { APICallError } from "ai";

it.effect("a finished slot takes the next job while another job is blocked", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const blocked = yield* Deferred.make<void>();
      const drained = yield* Deferred.make<void>();
      const queue = ["slow", "second", "third", "fourth"];
      const started: string[] = [];
      const poll = Effect.gen(function* () {
        const job = queue.shift();
        if (!job) return yield* Effect.never;
        started.push(job);
        if (job === "slow") return yield* Deferred.await(blocked);
        if (job === "fourth") yield* Deferred.succeed(drained, undefined);
      });
      yield* startIngestionLanes(2, poll);
      yield* Deferred.await(drained);
      expect(started).toEqual(["slow", "second", "third", "fourth"]);
    }),
  ),
);

it("preserves the actual nested failure without exposing request credentials", () => {
  const cause = new IngestionError({
    stage: "extracting",
    cause: new Error("Upload failed", {
      cause: new Error("Transport failed at https://storage.test/private?token=secret"),
    }),
  });
  const reason = failureReason(Cause.fail(cause));
  expect(reason).toContain("Ingestion failed while extracting");
  expect(reason).toContain("Transport failed");
  expect(reason).not.toContain("token=secret");
  expect(reason).toContain("[redacted URL]");
});

it("preserves quota reset delays through pipeline error wrappers", () => {
  const provider = new APICallError({
    message: "tokens per day exhausted",
    statusCode: 429,
    responseHeaders: { "retry-after": "461" },
    url: "https://provider.test",
    requestBodyValues: {},
  });
  const cause = Cause.fail(
    new IngestionError({
      stage: "indexing",
      cause: new Error("Graphing failed", { cause: provider }),
    }),
  );
  expect(providerRetryDelay(cause, 0)).toBe(461_000);
  expect(providerRetryDelay(Cause.fail(new Error("invalid file")), 0)).toBeUndefined();
});

it("wakes idle lanes only for notifications that can mean claimable work", () => {
  expect(
    wakesWorker(JSON.stringify({ userId: "u", id: "j", status: "queued", claimable: true })),
  ).toBe(true);
  expect(
    wakesWorker(JSON.stringify({ userId: "u", id: "j", status: "embedding", claimable: false })),
  ).toBe(false);
  // Payloads from before migration 0015, and anything unparseable, still wake.
  expect(wakesWorker(JSON.stringify({ userId: "u", id: "j" }))).toBe(true);
  expect(wakesWorker("not json")).toBe(true);
});
