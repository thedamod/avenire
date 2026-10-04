/**
 * Starting Ruth Cloud runs: the nightly scheduler, the "run now" request, and the
 * `CloudRuns` runner both use to execute runs in the background, bounded by
 * `RUTH_CLOUD_CONCURRENCY`.
 */
import {
  ArtifactId,
  CloudRunId,
  type CloudRun as CloudRunContract,
  Conflict,
  ItemId,
  NotFound,
  StorageKey,
  type UserId,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  artifact,
  type ArtifactRow,
  cloudRun,
  type CloudRunRow,
  cloudSchedule,
} from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";
import { and, asc, eq } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FiberSet from "effect/FiberSet";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";

import { RuthCloud } from "../agents/cloud.ts";
import { materialWindow, type MaterialWindow } from "./window.ts";

const TICK_INTERVAL = "1 minute";

const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const toContract = (row: CloudRunRow, artifacts: ReadonlyArray<ArtifactRow>): CloudRunContract => ({
  id: CloudRunId.make(row.id),
  status: row.status,
  windowStart: row.windowStart.toISOString(),
  windowEnd: row.windowEnd.toISOString(),
  startedAt: isoOrNull(row.startedAt),
  finishedAt: isoOrNull(row.finishedAt),
  error: row.error,
  artifacts: artifacts.map((entry) => ({
    id: ArtifactId.make(entry.id),
    kind: entry.kind,
    title: entry.title,
    storageKey: StorageKey.make(entry.storageKey),
    mimeType: entry.mimeType,
    sourceItemIds: entry.sourceItemIds.map((id) => ItemId.make(id)),
    createdAt: entry.createdAt.toISOString(),
  })),
});

/** Executes runs in the background, outliving the request or tick that started them. */
export class CloudRuns extends Context.Service<
  CloudRuns,
  { readonly start: (runId: CloudRunId) => Effect.Effect<void> }
>()("avenire/ai/CloudRuns") {}

export const CloudRunsLive = Layer.effect(
  CloudRuns,
  Effect.gen(function* () {
    const cloud = yield* RuthCloud;
    const concurrency = Math.max(
      1,
      yield* Config.Int("RUTH_CLOUD_CONCURRENCY").pipe(Config.withDefault(2)),
    );
    const permits = yield* Semaphore.make(concurrency);
    // Runs belong to the layer's scope, so shutting down interrupts them cleanly.
    const running = yield* FiberSet.make();

    return CloudRuns.of({
      start: (runId) =>
        cloud.execute(runId).pipe(
          permits.withPermits(1),
          Effect.catchCause((cause) => Effect.logError("Ruth Cloud run failed", { runId, cause })),
          FiberSet.run(running),
          Effect.asVoid,
        ),
    });
  }),
);

/** Inserts the run for this window; None if the window already has one. */
const createRun = Effect.fn("CloudScheduler.createRun")(function* (
  userId: string,
  window: MaterialWindow,
) {
  const database = yield* Database;
  const id = yield* newId(CloudRunId);
  const [created] = yield* database.use((db) =>
    db
      .insert(cloudRun)
      .values({
        id,
        userId,
        status: "scheduled",
        windowStart: DateTime.toDateUtc(DateTime.makeUnsafe(window.windowStart)),
        windowEnd: DateTime.toDateUtc(DateTime.makeUnsafe(window.windowEnd)),
      })
      .onConflictDoNothing({ target: [cloudRun.userId, cloudRun.windowStart] })
      .returning({ id: cloudRun.id }),
  );
  return created === undefined ? Option.none() : Option.some(id);
});

const getContractRun = Effect.fn("CloudScheduler.getRun")(function* (
  userId: UserId,
  runId: CloudRunId,
) {
  const database = yield* Database;
  const row = yield* database.use((db) =>
    db.query.cloudRun.findFirst({
      where: and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId)),
    }),
  );
  if (row === undefined) return yield* new NotFound({ entity: "CloudRun", id: runId });
  const artifacts = yield* database.use((db) =>
    db.query.artifact.findMany({
      where: and(eq(artifact.userId, userId), eq(artifact.cloudRunId, runId)),
      orderBy: [asc(artifact.createdAt)],
    }),
  );
  return toContract(row, artifacts);
});

/**
 * Creates the user's run for the current schedule window and starts it in the
 * background, returning immediately. Conflicts if this window already has a run.
 */
export const requestRunNow = Effect.fn("CloudScheduler.requestRunNow")(function* (userId: UserId) {
  const database = yield* Database;
  const runs = yield* CloudRuns;
  const schedule = yield* database.use((db) =>
    db.query.cloudSchedule.findFirst({ where: eq(cloudSchedule.userId, userId) }),
  );
  if (schedule === undefined || !schedule.enabled) {
    return yield* new Conflict({ reason: "Ruth Cloud is not enabled" });
  }
  const created = yield* createRun(userId, materialWindow(schedule, yield* DateTime.now));
  if (Option.isNone(created)) {
    return yield* new Conflict({ reason: "A Ruth Cloud run already exists for this daily window" });
  }
  yield* runs.start(created.value);
  return yield* getContractRun(userId, created.value);
});

/** Every minute, creates and starts the runs whose daily window has closed. */
export const CloudSchedulerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const runs = yield* CloudRuns;

    const tick = Effect.gen(function* () {
      const now = yield* DateTime.now;
      const schedules = yield* database.use((db) =>
        db.query.cloudSchedule.findMany({
          where: eq(cloudSchedule.enabled, true),
          orderBy: [asc(cloudSchedule.userId)],
        }),
      );
      const due = schedules.flatMap((schedule) => {
        const window = materialWindow(schedule, now);
        return window.due ? [{ userId: schedule.userId, window }] : [];
      });
      const created = yield* Effect.forEach(due, ({ userId, window }) => createRun(userId, window));
      const runIds = created.flatMap(Option.toArray);
      yield* Effect.forEach(runIds, runs.start, { discard: true });
      if (runIds.length > 0) {
        yield* Effect.logInfo("Started due Ruth Cloud runs", { count: runIds.length });
      }
    }).pipe(
      Effect.catchCause((cause) => Effect.logError("Ruth Cloud scheduler tick failed", { cause })),
    );

    yield* Effect.repeat(tick, Schedule.spaced(TICK_INTERVAL)).pipe(Effect.forkScoped);
  }),
);
