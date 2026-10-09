/** Pi owns the agent loop; this service owns provisioning, audit, delivery and cleanup. */
import { CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import {
  ArtifactId,
  CloudRunId,
  MessageId,
  NotFound,
  ThreadId,
  UserId,
  type HydrationResult,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  artifact,
  cloudHydration,
  cloudRun,
  cloudTask,
  emailOutbox,
  item,
  itemCluster,
  pendingApproval,
  ruthMessage,
  ruthThread,
  sandboxUsage,
  user,
  type CloudTaskRow,
} from "@avenire/database/schema";
import { hydrate, type CloudToolServices } from "@avenire/ruth-kit/cloud-tools";
import { RunTokens } from "@avenire/ruth-kit/run-tokens";
import { newId } from "@avenire/shared/id";
import { artifactKey } from "@avenire/storage/keys";
import { Storage } from "@avenire/storage/storage";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeRunPrompt } from "../prompts/cloud.ts";
import { buildReport, readFiles, reportMessage } from "./cloud-report.ts";
import {
  AVENIRE_DIR,
  LOG_TAIL_CHARS,
  parsePiLogs,
  piCommand,
  PI_EXTENSION,
  POLL_INTERVAL,
  RUN_WALL_CLOCK,
  runPaths,
  shellQuote,
} from "./cloud-pi.ts";

export { buildReport, reportMessage } from "./cloud-report.ts";
export { piCommand, RUN_WALL_CLOCK, POLL_INTERVAL, LOG_TAIL_CHARS } from "./cloud-pi.ts";

export class RuthCloudError extends Schema.TaggedError<RuthCloudError>()("RuthCloudError", {
  runId: Schema.String,
  reason: Schema.String,
  retryable: Schema.optionalKey(Schema.Boolean),
  cause: Schema.optionalKey(Schema.Defect()),
}) {
  override get message(): string {
    return `Ruth Cloud run ${this.runId} failed: ${this.reason}`;
  }
}
class RunCancelled extends Schema.TaggedError<RunCancelled>()("RunCancelled", {}) {}
export class RuthCloud extends Context.Service<
  RuthCloud,
  {
    readonly execute: (runId: CloudRunId) => Effect.Effect<void, RuthCloudError>;
  }
>()("avenire/ai/RuthCloud") {}

export interface RuthCloudOptions {
  readonly extensionSource: string;
  readonly apiBaseUrl: string;
  readonly appUrl: string;
  readonly model: string;
  /** Tests replace hydration at this boundary; production always uses ruth-kit's audited implementation. */
  readonly hydrate?: typeof hydrate;
}
const textBytes = (text: string) => new TextEncoder().encode(text);
const reasonFor = (cause: Cause.Cause<unknown>) => {
  const error = Cause.squash(cause);
  return (error instanceof Error ? error.message : Cause.pretty(cause)).slice(0, 2_000);
};
const retryable = (cause: Cause.Cause<unknown>, piStarted: boolean) => {
  const error = Cause.findErrorOption(cause);
  if (Option.isNone(error)) return false;
  const value = error.value;
  if (value instanceof RuthCloudError) return value.retryable === true;
  if (typeof value !== "object" || value === null || !("_tag" in value)) return false;
  return (
    value._tag === "CloudError" ||
    value._tag === "SandboxUnavailable" ||
    (value._tag === "SandboxTimeout" && !piStarted)
  );
};

/** Split usage across UTC midnights so a four-hour run cannot consume the wrong day's allowance. */
export const cloudUsageSegments = (start: number, end: number) => {
  const segments: { day: string; seconds: number }[] = [];
  for (let cursor = start; cursor < end;) {
    const date = new Date(cursor);
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
    const until = Math.min(midnight, end);
    segments.push({
      day: date.toISOString().slice(0, 10),
      seconds: Math.ceil((until - cursor) / 1000),
    });
    cursor = until;
  }
  return segments;
};

export const makeRuthCloud = Effect.fn("RuthCloud.make")(function* (options: RuthCloudOptions) {
  const database = yield* Database;
  const boxes = yield* CloudBoxes;
  const tokens = yield* RunTokens;
  const storage = yield* Storage;
  const crypto = yield* Crypto.Crypto;
  const hydrationServices = yield* Effect.context<CloudToolServices>();
  const hydrateRule = options.hydrate ?? hydrate;
  const appUrl = options.appUrl.replace(/\/$/, "");
  const bestEffort = <A, E>(step: string, program: Effect.Effect<A, E>) =>
    program.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logWarning(`Ruth Cloud ${step} failed`, { reason: reasonFor(cause) }).pipe(
              Effect.as(undefined),
            ),
      ),
    );
  const execute = Effect.fn("RuthCloud.execute")(
    function* (runId: CloudRunId) {
      const loaded = yield* database.use((db) =>
        db.query.cloudRun.findFirst({ where: eq(cloudRun.id, runId) }),
      );
      if (!loaded)
        return yield* new RuthCloudError({
          runId,
          reason: "Run not found",
          cause: new NotFound({ entity: "CloudRun", id: runId }),
        });
      if (["succeeded", "failed", "cancelled"].includes(loaded.status)) return;
      const run = loaded;
      const userId = UserId.make(run.userId);
      let task: CloudTaskRow | undefined;
      let box: CloudBox | undefined;
      let token = "";
      let recordingId: string | undefined;
      let recording: { id: string } | null = null;
      let boxStartedAt: number | undefined;
      let piStarted = false;
      let sessionEnded = false;
      let lastAssistant: string | null = null;
      let sawAgentStart = false;
      const hydrationFailures: string[] = [];
      const hydrations: HydrationResult[] = [];
      const scrub = (text: string) => (token ? text.replaceAll(token, "[redacted]") : text);
      const logStep = (step: string) =>
        Effect.logInfo("Ruth Cloud step", { step, userId, runId, taskId: run.taskId });
      const ownedWhere = and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId));
      const snapshot = () =>
        database.use((db) => db.query.cloudRun.findFirst({ where: ownedWhere }));
      const cancelled = Effect.fn("RuthCloud.checkCancellation")(function* () {
        const current = yield* snapshot();
        if (!current) return yield* new NotFound({ entity: "CloudRun", id: runId });
        if (current.status === "cancelled") return yield* new RunCancelled({});
        return current;
      });
      const stopRecording = Effect.fn("RuthCloud.stopRecording")(function* () {
        if (!box || !recordingId) return;
        const id = recordingId;
        const bytes = yield* box.stopRecording(id);
        recordingId = undefined;
        if (Option.isNone(bytes)) return;
        const artifactId = yield* newId(ArtifactId).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
        );
        const key = artifactKey(userId, artifactId, "recording.mp4");
        yield* storage.put(key, bytes.value, { contentType: "video/mp4" });
        const manifests = yield* database.use((db) =>
          db.query.cloudHydration.findMany({
            where: and(eq(cloudHydration.runId, runId), eq(cloudHydration.userId, userId)),
          }),
        );
        yield* database.use((db) =>
          db.insert(artifact).values({
            id: artifactId,
            userId,
            cloudRunId: runId,
            kind: "recording",
            title: "Ruth Cloud session recording",
            storageKey: key,
            mimeType: "video/mp4",
            sourceItemIds: readFiles(manifests).map((file) => file.fileId),
          }),
        );
        recording = { id: artifactId };
      });
      const finishReport = Effect.fn("RuthCloud.finishReport")(function* (
        status: "succeeded" | "failed" | "cancelled",
        summary: string,
        error?: string,
      ) {
        if (!task) {
          yield* database.use((db) =>
            db
              .update(cloudRun)
              .set({ status, error: error ?? null, finishedAt: sql`now()` })
              .where(ownedWhere),
          );
          return;
        }
        const current = yield* snapshot();
        if (!current) return yield* new NotFound({ entity: "CloudRun", id: runId });
        yield* bestEffort("recording collection", stopRecording());
        const manifests = yield* database.use((db) =>
          db.query.cloudHydration.findMany({
            where: and(eq(cloudHydration.runId, runId), eq(cloudHydration.userId, userId)),
            orderBy: [asc(cloudHydration.createdAt)],
          }),
        );
        const produced =
          current.clusterId === null
            ? []
            : yield* database.use((db) =>
                db
                  .select({ id: item.id, title: item.title })
                  .from(item)
                  .innerJoin(
                    itemCluster,
                    and(eq(itemCluster.itemId, item.id), eq(itemCluster.userId, userId)),
                  )
                  .where(
                    and(
                      eq(item.userId, userId),
                      eq(itemCluster.clusterId, current.clusterId!),
                      eq(item.source, "ruth-cloud"),
                    ),
                  )
                  .orderBy(asc(item.createdAt)),
              );
        const approvals = yield* database.use((db) =>
          db
            .select({
              itemTitle: item.title,
              summary: pendingApproval.summary,
              conflict: pendingApproval.conflict,
            })
            .from(pendingApproval)
            .innerJoin(item, and(eq(pendingApproval.itemId, item.id), eq(item.userId, userId)))
            .where(
              and(
                eq(pendingApproval.userId, userId),
                eq(pendingApproval.runId, runId),
                inArray(pendingApproval.status, ["pending", "conflict"]),
              ),
            )
            .orderBy(asc(pendingApproval.createdAt)),
        );
        const proposedThreadId = yield* newId(ThreadId).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
        );
        yield* database.use((db) =>
          db
            .insert(ruthThread)
            .values({ id: proposedThreadId, userId, kind: "ruth-cloud", title: "Ruth Cloud" })
            .onConflictDoNothing({
              target: ruthThread.userId,
              where: sql`${ruthThread.kind} = 'ruth-cloud'`,
            }),
        );
        const thread = yield* database.use((db) =>
          db.query.ruthThread.findFirst({
            where: and(eq(ruthThread.userId, userId), eq(ruthThread.kind, "ruth-cloud")),
          }),
        );
        if (!thread) return yield* new NotFound({ entity: "RuthCloudThread", id: userId });
        const now = DateTime.toDateUtc(yield* DateTime.now);
        const messageId = yield* newId(MessageId).pipe(
          Effect.provideService(Crypto.Crypto, crypto),
        );
        const emailId = yield* crypto.randomUUIDv7;
        const person =
          task.delivery.email && status !== "cancelled"
            ? yield* database.use((db) => db.query.user.findFirst({ where: eq(user.id, userId) }))
            : undefined;
        const reportUrl = `${appUrl}/ruth/${thread.id}?message=${messageId}`;
        const taskForReport = task;
        // Report, terminal state and outbox commit together; restart cannot post the same report twice.
        yield* database.useTransaction(async (tx) => {
          const [locked] = await tx.select().from(cloudRun).where(ownedWhere).for("update");
          if (!locked || locked.reportMessageId) return;
          const finalStatus = locked.status === "cancelled" ? "cancelled" : status;
          const report = buildReport({
            run: { ...locked, status: finalStatus, finishedAt: now },
            task: taskForReport,
            hydrations: manifests,
            produced,
            approvals,
            recording,
            summary: scrub(summary),
            appUrl,
            ...(error ? { error: scrub(error) } : {}),
            hydrationFailures,
          });
          const message = reportMessage(messageId, runId, report, now.toISOString());
          await tx.insert(ruthMessage).values({
            id: message.id,
            threadId: thread.id,
            userId,
            role: message.role,
            parts: message.parts,
            metadata: message.metadata,
            createdAt: now,
          });
          await tx
            .update(cloudRun)
            .set({
              status: finalStatus,
              summary: scrub(summary),
              reportMessageId: messageId,
              finishedAt: now,
              error: error ? scrub(error) : null,
            })
            .where(ownedWhere);
          if (person && finalStatus !== "cancelled")
            await tx.insert(emailOutbox).values({
              id: emailId,
              userId,
              toAddress: person.email,
              template: finalStatus === "failed" ? "cloud-run-failed" : "morning-digest",
              props:
                finalStatus === "failed"
                  ? {
                      name: person.name,
                      taskTitle: taskForReport.title,
                      reason: scrub(error ?? summary),
                      retryUrl: `${appUrl}/cloud`,
                    }
                  : {
                      name: person.name,
                      date: DateTime.formatIsoDate(
                        DateTime.makeZonedUnsafe(now, { timeZone: taskForReport.timeZone }),
                      ),
                      taskTitle: taskForReport.title,
                      summary: scrub(summary).slice(0, 600),
                      itemsRead: readFiles(manifests).length,
                      produced: produced.map((file) => ({
                        title: file.title,
                        url: `${appUrl}/library?item=${encodeURIComponent(file.id)}`,
                      })),
                      pendingApprovals: approvals.length,
                      reportUrl,
                    },
            });
        });
        yield* logStep("report posted and delivery enqueued");
      });
      const endSession = Effect.fn("RuthCloud.endSession")(function* () {
        if (box && !sessionEnded) {
          yield* box.endSession(runId);
          sessionEnded = true;
        }
      });
      const cleanup = Effect.fn("RuthCloud.cleanup")(function* () {
        yield* logStep("cleanup");
        // Every operation is independent: an unavailable secret service must never prevent token revocation.
        yield* bestEffort("token revocation", tokens.revokeRun(runId));
        yield* bestEffort("secret clearing", boxes.clearRunToken(userId));
        if (box) {
          yield* bestEffort("session termination", endSession());
          yield* bestEffort("recording cleanup", stopRecording());
        }
        if (boxStartedAt !== undefined) {
          const end = yield* Clock.currentTimeMillis;
          for (const segment of cloudUsageSegments(boxStartedAt, end))
            yield* bestEffort(
              "usage recording",
              database.use((db) =>
                db
                  .insert(sandboxUsage)
                  .values({ userId, day: segment.day, cloudSeconds: segment.seconds })
                  .onConflictDoUpdate({
                    target: [sandboxUsage.userId, sandboxUsage.day],
                    set: { cloudSeconds: sql`${sandboxUsage.cloudSeconds} + ${segment.seconds}` },
                  }),
              ),
            );
        }
        const active = yield* bestEffort(
          "active run lookup",
          database.use((db) =>
            db.query.cloudRun.findMany({
              where: and(
                eq(cloudRun.userId, userId),
                ne(cloudRun.id, runId),
                inArray(cloudRun.status, ["provisioning", "running"]),
              ),
            }),
          ),
        );
        // If the database is unavailable, leave the box to its idle-stop policy rather than interrupting another run.
        if (active?.length === 0) yield* bestEffort("box stop", boxes.stop(userId));
      });
      const handleFailure = Effect.fn("RuthCloud.handleFailure")(function* (
        cause: Cause.Cause<unknown>,
      ) {
        // Stop compute before database/report work, especially when the wall-clock cap or cancellation fired.
        if (piStarted) yield* bestEffort("failed command termination", endSession());
        const current = yield* snapshot();
        if (current?.reportMessageId) return;
        const failure = Cause.findErrorOption(cause);
        const isCancelled =
          current?.status === "cancelled" ||
          Cause.hasInterrupts(cause) ||
          (Option.isSome(failure) && failure.value instanceof RunCancelled);
        if (isCancelled) {
          yield* finishReport("cancelled", current?.summary ?? "The run was cancelled.");
          return;
        }
        const reason = scrub(reasonFor(cause));
        if (task && retryable(cause, piStarted) && run.attempt < task.maxAttempts) {
          const retryId = yield* newId(CloudRunId).pipe(
            Effect.provideService(Crypto.Crypto, crypto),
          );
          const now = yield* DateTime.now;
          yield* database.useTransaction(async (tx) => {
            // Cancellation wins over a failure racing the user's request.
            const [locked] = await tx.select().from(cloudRun).where(ownedWhere).for("update");
            if (!locked || locked.status === "cancelled") return;
            await tx
              .update(cloudRun)
              .set({
                status: "failed",
                finishedAt: DateTime.toDateUtc(now),
                error: `Retrying: ${reason}`,
              })
              .where(ownedWhere);
            await tx
              .insert(cloudRun)
              .values({
                id: retryId,
                userId,
                taskId: run.taskId,
                scheduledFor: run.scheduledFor,
                attempt: run.attempt + 1,
                status: "scheduled",
                notBefore: DateTime.toDateUtc(DateTime.add(now, { minutes: 5 * run.attempt })),
              })
              .onConflictDoNothing({
                target: [cloudRun.taskId, cloudRun.scheduledFor, cloudRun.attempt],
              });
          });
          yield* logStep("retry scheduled");
          return;
        }
        yield* finishReport(
          "failed",
          current?.summary ?? lastAssistant ?? "Ruth Cloud could not finish this task.",
          reason,
        );
      });
      const program = Effect.gen(function* () {
        task = yield* database.use((db) =>
          db.query.cloudTask.findFirst({
            where: and(eq(cloudTask.id, run.taskId), eq(cloudTask.userId, userId)),
          }),
        );
        if (!task) return yield* new NotFound({ entity: "CloudTask", id: run.taskId });
        yield* logStep("provisioning");
        const now = yield* DateTime.now;
        const rows = yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ status: "provisioning", startedAt: DateTime.toDateUtc(now), error: null })
            .where(and(ownedWhere, inArray(cloudRun.status, ["scheduled", "provisioning"])))
            .returning({ id: cloudRun.id }),
        );
        if (!rows.length) return yield* new RunCancelled({});
        yield* logStep("mint run token");
        const minted = yield* tokens
          .mint({
            userId,
            runId,
            scopes: ["retrieval", "download", "hydrate", "publish"],
            expiresAt: DateTime.add(now, { milliseconds: RUN_WALL_CLOCK + 15 * 60_000 }),
          })
          .pipe(Effect.provideService(Crypto.Crypto, crypto), Effect.uninterruptible);
        token = minted.token;
        // Daytona has no abort-aware lifecycle API; finish the secret write before cleanup can rotate it.
        yield* boxes.setRunToken(userId, token).pipe(Effect.uninterruptible);
        yield* logStep("ensure workspace");
        const boxStart = yield* Clock.currentTimeMillis;
        box = yield* boxes.ensure(userId);
        boxStartedAt = boxStart;
        yield* database.use((db) =>
          db.update(cloudRun).set({ sandboxId: box!.id }).where(ownedWhere),
        );
        yield* cancelled();
        const paths = runPaths(runId);
        yield* logStep("write run configuration and extension");
        yield* box.writeFile(
          `${AVENIRE_DIR}/run.json`,
          textBytes(JSON.stringify({ runId, apiBaseUrl: options.apiBaseUrl })),
        );
        yield* box.writeFile(PI_EXTENSION, textBytes(options.extensionSource));
        const promptInput = {
          taskPrompt: task.prompt,
          timeZone: task.timeZone,
          date: DateTime.formatIsoDate(DateTime.makeZonedUnsafe(now, { timeZone: task.timeZone })),
          outDir: paths.outDir,
          hydrations,
          hydrationFailures,
        };
        yield* box.writeFile(paths.prompt, textBytes(makeRunPrompt(promptInput)));
        // writeFile creates parents, but out/ must exist before Pi's shell/compute tools run.
        const prepared = yield* box.exec(`mkdir -p ${shellQuote(paths.outDir)}`, {
          cwd: paths.runDir,
        });
        if (prepared.exitCode !== 0)
          return yield* new RuthCloudError({
            runId,
            reason: "Could not prepare the run output directory",
            retryable: true,
          });
        yield* logStep("pre-hydration");
        for (const rule of task.preHydration) {
          yield* cancelled();
          const result = yield* hydrateRule(
            { agent: "ruth-cloud", userId, runId, fullAccess: false, timeZone: task.timeZone },
            rule,
            "pre-hydration",
          ).pipe(
            Effect.provideContext(hydrationServices),
            Effect.catchCause((cause) => {
              if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
              const reason = scrub(reasonFor(cause));
              hydrationFailures.push(reason);
              return Effect.logWarning("Ruth Cloud pre-hydration failed", {
                userId,
                runId,
                taskId: run.taskId,
                reason,
              }).pipe(Effect.as(undefined));
            }),
          );
          if (result) hydrations.push(result);
        }
        yield* box.writeFile(paths.prompt, textBytes(makeRunPrompt(promptInput)));
        yield* cancelled();
        yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ status: "running" })
            .where(and(ownedWhere, eq(cloudRun.status, "provisioning"))),
        );
        yield* logStep("running");
        yield* bestEffort("desktop start", box.startDesktop);
        // Daytona acquisition calls cannot abort; retain their IDs before cleanup can run.
        yield* Effect.gen(function* () {
          const startedRecording = yield* bestEffort(
            "recording start",
            box!.startRecording(`ruth-${runId}`),
          );
          if (startedRecording && Option.isSome(startedRecording))
            recordingId = startedRecording.value;
        }).pipe(Effect.uninterruptible);
        yield* cancelled();
        yield* logStep("start Pi command");
        const command = yield* Effect.gen(function* () {
          const started = yield* box!.startCommand({
            sessionId: runId,
            command: piCommand(runId, options.model),
            cwd: paths.runDir,
          });
          piStarted = true;
          return started;
        }).pipe(Effect.uninterruptible);
        let lastLogAt = now.epochMilliseconds;
        let exitCode: number;
        while (true) {
          yield* cancelled();
          const time = yield* Clock.currentTimeMillis;
          const status = yield* box.commandStatus(runId, command.commandId);
          if (time - lastLogAt >= 60_000 || status.exitCode !== null) {
            // Parse a bounded event window separately from the much smaller persisted log tail.
            const logs = scrub(yield* box.commandLogs(runId, command.commandId, 1_048_576));
            const events = parsePiLogs(logs);
            lastAssistant = events.assistantText ?? lastAssistant;
            sawAgentStart ||= events.started;
            yield* database.use((db) =>
              db
                .update(cloudRun)
                .set({ logTail: logs.slice(-LOG_TAIL_CHARS) })
                .where(ownedWhere),
            );
            if (events.error && status.exitCode !== null) {
              const current = yield* cancelled();
              return yield* new RuthCloudError({
                runId,
                reason: events.error,
                retryable: !sawAgentStart && !current.summary,
              });
            }
            lastLogAt = time;
          }
          if (status.exitCode !== null) {
            exitCode = status.exitCode;
            break;
          }
          yield* Effect.sleep(POLL_INTERVAL);
        }
        yield* logStep("Pi exited");
        const current = yield* cancelled();
        const summary = current.summary ?? lastAssistant ?? "Ruth Cloud finished without a report.";
        if (current.error) return yield* new RuthCloudError({ runId, reason: current.error });
        if (exitCode !== 0 && !current.summary)
          return yield* new RuthCloudError({
            runId,
            reason: `Pi exited with code ${exitCode} without a report.`,
            retryable: !sawAgentStart,
          });
        yield* finishReport("succeeded", summary);
      }).pipe(
        Effect.timeoutOrElse({
          duration: RUN_WALL_CLOCK,
          orElse: () =>
            Effect.fail(
              new RuthCloudError({
                runId,
                reason: "The run exceeded its four-hour wall-clock limit.",
                retryable: !piStarted,
              }),
            ),
        }),
      );
      yield* program.pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit)
            ? bestEffort("failure recording", handleFailure(exit.cause))
            : Effect.void,
        ),
        Effect.ensuring(cleanup()),
        Effect.catchTag("RunCancelled", () => Effect.void),
        Effect.mapError((cause) =>
          cause instanceof RuthCloudError
            ? cause
            : new RuthCloudError({ runId, reason: scrub(cause.message), cause }),
        ),
        Effect.annotateLogs({ userId, runId, taskId: run.taskId }),
      );
    },
    (effect) => effect.pipe(Effect.annotateLogs({ agent: "ruth-cloud" })),
  );
  return RuthCloud.of({
    execute: (runId) =>
      execute(runId).pipe(
        Effect.mapError((cause) =>
          cause instanceof RuthCloudError
            ? cause
            : new RuthCloudError({ runId, reason: cause.message, cause }),
        ),
      ),
  });
});

export const RuthCloudLive = Layer.effect(
  RuthCloud,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const config = yield* Config.all({
      apiBaseUrl: Config.String("RUTH_CLOUD_API_BASE_URL"),
      appUrl: Config.String("APP_URL").pipe(Config.withDefault("https://avenire.space")),
      model: Config.String("RUTH_CLOUD_PI_MODEL").pipe(Config.withDefault("claude-opus-5-5")),
    });
    // Load the deployed static asset once, rather than once per scheduled run.
    const extensionSource = yield* fs.readFileString(
      fileURLToPath(new URL("../../pi/avenire-extension.ts", import.meta.url)),
    );
    return yield* makeRuthCloud({ ...config, extensionSource });
  }),
);
