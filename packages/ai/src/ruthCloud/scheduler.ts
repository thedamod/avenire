import * as Config from "effect/Config";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { and, asc, eq } from "drizzle-orm";

import {
  ArtifactId,
  CloudRunId,
  Conflict,
  ItemId,
  NotFound,
  StorageKey,
  type UserId,
  type CloudRun as CloudRunContract,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { artifact, cloudRun, cloudSchedule } from "@avenire/database/schema";
import { newId } from "@avenire/shared/id";

import { RuthCloud } from "./run.ts";
import { materialWindow } from "./window.ts";

export class CloudSchedulerError extends Schema.TaggedError<CloudSchedulerError>()(
  "CloudSchedulerError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const asDate = (iso: string): Date => DateTime.toDateUtc(DateTime.makeUnsafe(iso));
const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : DateTime.formatIso(DateTime.makeUnsafe(value));

const contractRun = (
  row: typeof cloudRun.$inferSelect,
  artifacts: ReadonlyArray<typeof artifact.$inferSelect>,
): CloudRunContract => ({
  id: CloudRunId.make(row.id),
  status: row.status,
  windowStart: DateTime.formatIso(DateTime.makeUnsafe(row.windowStart)),
  windowEnd: DateTime.formatIso(DateTime.makeUnsafe(row.windowEnd)),
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
    createdAt: DateTime.formatIso(DateTime.makeUnsafe(entry.createdAt)),
  })),
});

const getContractRun = (userId: string, runId: string) =>
  Effect.gen(function* () {
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
    return contractRun(row, artifacts);
  });

/**
 * Creates the user's run for the current schedule window and starts it in the
 * background, returning immediately. Conflicts if this window already has a run.
 */
export const requestRunNow = (userId: UserId) =>
  Effect.gen(function* () {
    const database = yield* Database;
    const cloud = yield* RuthCloud;
    const schedule = yield* database.use((db) =>
      db.query.cloudSchedule.findFirst({
        where: eq(cloudSchedule.userId, userId),
      }),
    );
    if (schedule === undefined || !schedule.enabled)
      return yield* new Conflict({ reason: "Ruth Cloud is not enabled" });
    const now = yield* DateTime.now;
    const window = materialWindow(schedule, now);
    const id = yield* newId(CloudRunId);
    const databaseResult = yield* database.use((db) =>
      db
        .insert(cloudRun)
        .values({
          id,
          userId,
          status: "scheduled",
          windowStart: asDate(window.windowStart),
          windowEnd: asDate(window.windowEnd),
        })
        .onConflictDoNothing({ target: [cloudRun.userId, cloudRun.windowStart] })
        .returning({ id: cloudRun.id }),
    );
    const created = databaseResult[0];
    if (created === undefined)
      return yield* new Conflict({
        reason: "A Ruth Cloud run already exists for this daily window",
      });
    // Runs take many minutes; detach so the RPC returns while the run proceeds.
    yield* cloud.execute(created.id).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Ruth Cloud run failed", { runId: created.id, cause }),
      ),
      Effect.forkDetach,
    );
    return yield* getContractRun(userId, created.id);
  });

export const CloudSchedulerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database;
    const cloud = yield* RuthCloud;
    const concurrency = Math.max(
      1,
      yield* Config.Int("RUTH_CLOUD_CONCURRENCY").pipe(Config.withDefault(2)),
    );

    const runs = yield* Semaphore.make(concurrency);
    const scope = yield* Effect.scope;

    const tick = Effect.gen(function* () {
      const now = yield* DateTime.now;
      const schedules = yield* database.use((db) =>
        db.query.cloudSchedule.findMany({
          where: eq(cloudSchedule.enabled, true),
          orderBy: [asc(cloudSchedule.userId)],
        }),
      );
      const createdIds: Array<string> = [];
      for (const schedule of schedules) {
        const window = materialWindow(schedule, now);
        if (!window.due) continue;
        const id = yield* newId(CloudRunId);
        const created = yield* database.use((db) =>
          db
            .insert(cloudRun)
            .values({
              id,
              userId: schedule.userId,
              status: "scheduled",
              windowStart: asDate(window.windowStart),
              windowEnd: asDate(window.windowEnd),
            })
            .onConflictDoNothing({ target: [cloudRun.userId, cloudRun.windowStart] })
            .returning({ id: cloudRun.id }),
        );
        if (created[0] !== undefined) createdIds.push(created[0].id);
      }
      // Fork each run behind the semaphore so a long run never delays the next tick.
      for (const runId of createdIds) {
        yield* runs
          .withPermits(1)(cloud.execute(runId))
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logError("Ruth Cloud execution failed", { runId, cause }),
            ),
            Effect.forkIn(scope),
          );
      }
      if (createdIds.length > 0)
        yield* Effect.logInfo("Started due Ruth Cloud runs", { count: createdIds.length });
    }).pipe(
      Effect.catchCause((cause) => Effect.logError("Ruth Cloud scheduler tick failed", { cause })),
    );

    yield* Effect.repeat(tick, Schedule.spaced("1 minute")).pipe(Effect.forkScoped);
  }),
);
