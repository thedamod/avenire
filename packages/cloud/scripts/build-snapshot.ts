import * as Effect from "effect/Effect";

import { DaytonaClient, DaytonaClientLive } from "../src/daytona.ts";
import {
  AVENIRE_SNAPSHOT,
  SANDBOX_RESOURCES,
  avenireSandboxImage,
  ensureSnapshot,
} from "../src/snapshots.ts";

const build = Effect.gen(function* () {
  const daytona = yield* DaytonaClient;
  yield* ensureSnapshot(daytona, AVENIRE_SNAPSHOT, avenireSandboxImage, SANDBOX_RESOURCES, {
    onLogs: (chunk) => process.stdout.write(chunk.endsWith("\n") ? chunk : `${chunk}\n`),
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
