import { describe, expect, it } from "@effect/vitest";
import { CloudRunId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { RuthCloud } from "../agents/cloud.ts";
import { recordingDatabase } from "../cloud-test-support.ts";
import { CloudRuns, CloudRunsLive } from "./index.ts";

const fixture = (cloud: RuthCloud["Service"]) => {
  const f = recordingDatabase();
  for (const [id, status] of [
    ["one", "provisioning"],
    ["cancelled", "cancelled"],
  ])
    f.rows("cloud_run").push({ id, userId: "owner", taskId: "task", status, startedAt: null });
  const layer = CloudRunsLive.pipe(
    Layer.provide(
      Layer.mergeAll(Layer.succeed(Database, f.database), Layer.succeed(RuthCloud, cloud)),
    ),
  );
  return { ...f, layer };
};

describe("CloudRuns", () => {
  it.effect("executes claimed runs in the background and skips cancelled ones", () =>
    Effect.gen(function* () {
      const done = yield* Deferred.make<void>();
      const calls: string[] = [];
      const f = fixture(
        RuthCloud.of({
          execute: (id) =>
            Effect.sync(() => calls.push(id)).pipe(
              Effect.andThen(Deferred.succeed(done, undefined)),
            ),
        }),
      );
      yield* Effect.gen(function* () {
        const runs = yield* CloudRuns;
        yield* runs.start(CloudRunId.make("cancelled"));
        yield* runs.start(CloudRunId.make("one"));
        yield* Deferred.await(done);
      }).pipe(Effect.provide(f.layer));
      expect(calls).toEqual(["one"]);
    }),
  );

  it.effect("shutting the worker down runs the run's finalizers before returning", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let cleaned = false;
      const f = fixture(
        RuthCloud.of({
          execute: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Effect.sync(() => (cleaned = true))),
            ),
        }),
      );
      const worker = yield* Effect.forkChild(
        Effect.gen(function* () {
          yield* (yield* CloudRuns).start(CloudRunId.make("one"));
          yield* Effect.never;
        }).pipe(Effect.provide(f.layer)),
      );
      yield* Deferred.await(started);
      yield* Fiber.interrupt(worker);
      expect(cleaned).toBe(true);
    }),
  );
});
