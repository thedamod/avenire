import * as Effect from "effect/Effect";

import { attempt, DaytonaClient, DaytonaClientLive } from "../src/daytona.ts";
import {
  AVENIRE_SNAPSHOT,
  SANDBOX_RESOURCES,
  avenireSandboxImage,
  ensureSnapshot,
} from "../src/snapshots.ts";

const build = Effect.gen(function* () {
  const daytona = yield* DaytonaClient;
  // SDK 0.220.0's optional log stream can reject before its polling promise awaits it.
  // Omit streaming; creation still polls the API until the build is active.
  const snapshot = yield* ensureSnapshot(
    daytona,
    AVENIRE_SNAPSHOT,
    avenireSandboxImage,
    SANDBOX_RESOURCES,
  );
  yield* attempt("waitSnapshotActive", async () => {
    let current = snapshot;
    const deadline = Date.now() + 30 * 60 * 1000;
    while (["pending", "building", "pulling"].includes(current.state)) {
      if (Date.now() > deadline) throw new Error(`Build wait timed out: ${current.id}`);
      process.stdout.write(`Snapshot ${current.id}: ${current.state}\n`);
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      current = await daytona.snapshot.get(current.id);
    }
    if (current.state !== "active")
      throw new Error(`Snapshot ${current.state}: ${current.errorReason}`);
  });
  return AVENIRE_SNAPSHOT;
}).pipe(Effect.provide(DaytonaClientLive));

Effect.runPromise(build).then(
  (name) => process.stdout.write(`Snapshot ready: ${name}\n`),
  (error: unknown) => {
    process.stderr.write(`Snapshot build failed: ${String(error)}\n`);
    process.exitCode = 1;
  },
);
