/** Server-owned AI SDK agent; Daytona is an isolated persistent tool target. */
import { CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import {
  AssetId,
  CloudRunId,
  MessageId,
  NotFound,
  ThreadId,
  UserId,
  type HydrationResult,
} from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import {
  cloudHydration,
  cloudRun,
  cloudTask,
  cloudToolCall,
  emailOutbox,
  file,
  fileFolder,
  pendingApproval,
  ruthMessage,
  ruthThread,
  sandboxUsage,
  user,
  type CloudTaskRow,
} from "@avenire/database/schema";
import { hydrate, cloudToolRegistrations, type CloudToolServices } from "../cloud/tools.ts";
import { makeRunEventWriter, type RunEventWriter } from "../cloud/events.ts";
import { inputsRootFor, runPaths, RUN_WALL_CLOCK } from "../cloud/paths.ts";
import { stableToolId, withToolJournal } from "../cloud/journal.ts";
import { newId } from "@avenire/shared/id";
import { AssetStore } from "../outputs/assets.ts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import { makeRunPrompt } from "../prompts/cloud.ts";
import { buildReport, readFiles, reportMessage } from "./cloud-report.ts";
import { createAgent } from "./factory.ts";
import { RuthModels, RuthModelsLive, RUTH_MODEL_NAMES } from "../models/index.ts";
import { createImageTransport } from "../tools/images.ts";
import { RUTH_TOOL_SPECS, RUTH_TOOL_POLICY, type RuthToolName } from "../tools/specs.ts";
import { ruthKitTools } from "../tools/library.ts";
import type { ToolRegistration } from "../tools/registration.ts";
import { toAiSdkTools } from "../tools/ai-sdk.ts";
import { makeComputerRegistry, shellQuote, type ComputerServices } from "../tools/computer.ts";
import { sandboxToolRegistry } from "../tools/sandbox-tools.ts";
import { recordingRegistry, storeRecording } from "../tools/recording.ts";
import type { RuthToolServices } from "../tools/ruth.ts";
import {
  runCloudLoop,
  pendingToolCalls,
  CloudLoopError,
  type LoopCheckpoint,
} from "./cloud-loop.ts";

export { buildReport, reportMessage } from "./cloud-report.ts";
export { RUN_WALL_CLOCK } from "../cloud/paths.ts";
export class RuthCloudError extends Schema.TaggedError<RuthCloudError>()("RuthCloudError", {
  runId: Schema.String,
  reason: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}
class RunCancelled extends Schema.TaggedError<RunCancelled>()("RunCancelled", {}) {}
class LeaseLost extends Schema.TaggedError<LeaseLost>()("LeaseLost", {}) {}
export class RuthCloud extends Context.Service<
  RuthCloud,
  {
    readonly execute: (runId: CloudRunId) => Effect.Effect<void, RuthCloudError>;
  }
>()("avenire/ai/RuthCloud") {}
export interface RuthCloudOptions {
  readonly appUrl: string;
  readonly maxActions?: number;
  readonly maxCost?: number;
  readonly hydrate?: typeof hydrate;
}
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
  const assets = yield* AssetStore;
  const crypto = yield* Crypto.Crypto;
  const models = yield* RuthModels;
  const services = yield* Effect.context<CloudToolServices | RuthToolServices | ComputerServices>();
  const hydrationServices = services;
  const hydrateRule = options.hydrate ?? hydrate;
  const appUrl = options.appUrl.replace(/\/$/, "");
  const bestEffort = <A, E>(step: string, program: Effect.Effect<A, E>) =>
    program.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.logWarning(`Ruth Cloud ${step} failed`).pipe(Effect.as(undefined)),
      ),
    );
  const execute = Effect.fn("RuthCloud.execute")(function* (runId: CloudRunId) {
    const loaded = yield* database.use((db) =>
      db.query.cloudRun.findFirst({ where: eq(cloudRun.id, runId) }),
    );
    if (!loaded) return yield* new RuthCloudError({ runId, reason: "Run not found" });
    const terminalRecovery = ["succeeded", "failed", "cancelled"].includes(loaded.status);
    if (terminalRecovery && (!loaded.leasedBy || loaded.usage.cleanupComplete)) return;
    const run = loaded;
    const userId = UserId.make(run.userId);
    const leaseOwner = run.leasedBy ?? randomUUID();
    const ownedWhere = and(eq(cloudRun.id, runId), eq(cloudRun.userId, userId));
    const fencedWhere = and(ownedWhere, eq(cloudRun.leasedBy, leaseOwner));
    let task: CloudTaskRow | undefined;
    let box: CloudBox | undefined;
    /** False when the box was replaced since the run started: a recording cannot outlive its box. */
    let recordingReachable = true;
    let recording: { id: string; url: string } | null = null;
    let writer: RunEventWriter | undefined;
    let boxStartedAt: number | undefined;
    const hydrations: HydrationResult[] = [];
    const hydrationFailures: string[] = [];
    const logStep = (step: string) =>
      Effect.logInfo("Ruth Cloud step", { step, userId, runId, taskId: run.taskId });
    const snapshot = () => database.use((db) => db.query.cloudRun.findFirst({ where: ownedWhere }));
    const cancelled = Effect.fn("RuthCloud.checkCancellation")(function* () {
      const current = yield* snapshot();
      if (!current) return yield* new NotFound({ entity: "CloudRun", id: runId });
      if (current.leasedBy !== leaseOwner) return yield* new LeaseLost({});
      if (current.status === "cancelled") return yield* new RunCancelled({});
      return current;
    });
    const events = Effect.fn("RuthCloud.events")(function* () {
      writer ??= yield* makeRunEventWriter(runId);
      return writer;
    });
    /** Delivery is best effort and a lost fence is the only failure that matters to the run. */
    const deliver = (write: (log: RunEventWriter) => RunEventWriter["begin"]) =>
      events().pipe(
        Effect.flatMap(write),
        Effect.catchTag("RunEventConflict", () => Effect.fail(new LeaseLost({}))),
        Effect.catchTag("DatabaseError", (error) =>
          Effect.logWarning("Cloud run events are unavailable", { runId, error }),
        ),
      );
    const emit = (chunks: ReadonlyArray<import("ai").UIMessageChunk>) =>
      deliver((log) => log.append(chunks));
    /** The agent starts and stops recordings with screen_record; only one it left running is finalised here. */
    const stopRecording = Effect.fn("RuthCloud.stopRecording")(function* () {
      if (!box || !recordingReachable) return;
      const current = yield* snapshot();
      const id = current?.recordingId;
      if (!id) return;
      const assetId = AssetId.make(stableToolId({ runId, toolCallId: "recording" }, "asset"));
      const prior = yield* assets.get(assetId);
      if (Option.isSome(prior)) {
        recording = { id: prior.value.id, url: prior.value.url };
        return;
      }
      if (!(yield* box.recordings).some((r) => r.id === id)) return;
      const stored = yield* storeRecording({
        download: (localPath) => box!.stopRecording(id, localPath),
        userId,
        title: "Ruth Cloud session recording",
        runId,
        idempotencyId: assetId,
      }).pipe(
        Effect.provideService(AssetStore, assets),
        Effect.provideService(Crypto.Crypto, crypto),
      );
      recording = { id: stored.id, url: stored.url };
    });
    /** The run's last event: the stream routes close on it. Safe to call more than once. */
    const endEvents = (status: "succeeded" | "failed" | "cancelled", error?: string) =>
      events().pipe(
        Effect.flatMap((log) =>
          log.end(
            status === "cancelled"
              ? [{ type: "abort", reason: "The run was cancelled." }]
              : status === "failed"
                ? [
                    { type: "error", errorText: error ?? "The run failed." },
                    { type: "finish", finishReason: "error" },
                  ]
                : [{ type: "finish", finishReason: "stop" }],
          ),
        ),
        Effect.ignore({ log: "Warn", message: "Could not close the Cloud run event log" }),
      );
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
        yield* endEvents(status, error);
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
        current.folderId === null
          ? []
          : yield* database.use((db) =>
              db
                .select({ id: file.id, title: file.title })
                .from(file)
                .innerJoin(
                  fileFolder,
                  and(eq(fileFolder.fileId, file.id), eq(fileFolder.userId, userId)),
                )
                .where(
                  and(
                    eq(file.userId, userId),
                    eq(fileFolder.folderId, current.folderId!),
                    eq(file.source, "ruth-cloud"),
                  ),
                )
                .orderBy(asc(file.createdAt)),
            );
      const approvals = yield* database.use((db) =>
        db
          .select({
            fileTitle: file.title,
            summary: pendingApproval.summary,
            conflict: pendingApproval.conflict,
          })
          .from(pendingApproval)
          .innerJoin(file, and(eq(pendingApproval.fileId, file.id), eq(file.userId, userId)))
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
            where: eq(ruthThread.kind, "ruth-cloud"),
          }),
      );
      const thread = yield* database.use((db) =>
        db.query.ruthThread.findFirst({
          where: and(eq(ruthThread.userId, userId), eq(ruthThread.kind, "ruth-cloud")),
        }),
      );
      if (!thread) return yield* new NotFound({ entity: "RuthCloudThread", id: userId });
      const now = DateTime.toDateUtc(yield* DateTime.now);
      const messageId = yield* newId(MessageId).pipe(Effect.provideService(Crypto.Crypto, crypto));
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
        if (!locked || locked.reportMessageId || locked.leasedBy !== leaseOwner) return;
        const finalStatus = locked.status === "cancelled" ? "cancelled" : status;
        const report = buildReport({
          run: { ...locked, status: finalStatus, finishedAt: now },
          task: taskForReport,
          hydrations: manifests,
          produced,
          approvals,
          recording,
          summary: summary,
          appUrl,
          ...(error ? { error: error } : {}),
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
            summary: summary,
            reportMessageId: messageId,
            finishedAt: now,
            error: error ? error : null,
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
                    reason: error ?? summary,
                    retryUrl: `${appUrl}/cloud`,
                  }
                : {
                    name: person.name,
                    date: DateTime.formatIsoDate(
                      DateTime.makeZonedUnsafe(now, { timeZone: taskForReport.timeZone }),
                    ),
                    taskTitle: taskForReport.title,
                    summary: summary.slice(0, 600),
                    filesRead: readFiles(manifests).length,
                    produced: produced.map((file) => ({
                      title: file.title,
                      url: `${appUrl}/library?file=${encodeURIComponent(file.id)}`,
                    })),
                    pendingApprovals: approvals.length,
                    reportUrl,
                  },
          });
      });
      yield* endEvents(status, error);
      yield* logStep("report posted and delivery enqueued");
    });

    const cleanup = Effect.fn("RuthCloud.cleanup")(function* () {
      const current = yield* snapshot();
      if (current?.leasedBy !== leaseOwner) return;
      yield* stopRecording();
      const commands = yield* database.use((db) =>
        db.query.cloudToolCall.findMany({ where: eq(cloudToolCall.runId, runId) }),
      );
      if (box)
        for (const command of commands)
          if (command.sessionId)
            yield* bestEffort("command cleanup", box.endSession(command.sessionId));
      if (boxStartedAt !== undefined || run.startedAt) {
        const end = yield* Clock.currentTimeMillis;
        const segments = cloudUsageSegments(run.startedAt?.getTime() ?? boxStartedAt!, end);
        yield* database.useTransaction(async (tx) => {
          const [current] = await tx.select().from(cloudRun).where(fencedWhere).for("update");
          if (!current || current.usage.boxMetered) return;
          for (const segment of segments) {
            // eslint-disable-next-line no-await-in-loop -- These writes commit with the run's metering marker in this transaction.
            await tx
              .insert(sandboxUsage)
              .values({ userId, day: segment.day, cloudSeconds: segment.seconds })
              .onConflictDoUpdate({
                target: [sandboxUsage.userId, sandboxUsage.day],
                set: { cloudSeconds: sql`${sandboxUsage.cloudSeconds} + ${segment.seconds}` },
              });
          }
          await tx
            .update(cloudRun)
            .set({ usage: { ...current.usage, boxMetered: true } })
            .where(fencedWhere);
        });
      }
      yield* boxes.stop(userId);
      const metered = yield* snapshot();
      yield* database.use((db) =>
        db
          .update(cloudRun)
          .set({
            leasedBy: null,
            leaseExpiresAt: null,
            usage: { ...metered!.usage, cleanupComplete: true },
          })
          .where(fencedWhere),
      );
    });
    const finishCleanup = () =>
      Effect.raceFirst(
        cleanup(),
        Effect.repeat(
          database
            .use((db) =>
              db
                .update(cloudRun)
                .set({ heartbeatAt: sql`now()`, leaseExpiresAt: sql`now() + interval '5 minutes'` })
                .where(fencedWhere)
                .returning({ id: cloudRun.id }),
            )
            .pipe(
              Effect.flatMap((rows) =>
                rows.length ? Effect.void : Effect.fail(new LeaseLost({})),
              ),
            ),
          Schedule.spaced("30 seconds"),
        ),
      );
    if (terminalRecovery) {
      task = yield* database.use((db) =>
        db.query.cloudTask.findFirst({
          where: and(eq(cloudTask.id, run.taskId), eq(cloudTask.userId, userId)),
        }),
      );
      box = yield* boxes.ensure(userId, task?.network ?? "packages");
      recordingReachable = box.id === run.sandboxId;
      yield* finishCleanup();
      return;
    }
    const program = Effect.gen(function* () {
      task = yield* database.use((db) =>
        db.query.cloudTask.findFirst({
          where: and(eq(cloudTask.id, run.taskId), eq(cloudTask.userId, userId)),
        }),
      );
      if (!task) return yield* new NotFound({ entity: "CloudTask", id: run.taskId });
      const modelName = run.modelName ?? task.model ?? "ruth-core";
      if (!RUTH_MODEL_NAMES.includes(modelName as (typeof RUTH_MODEL_NAMES)[number]))
        return yield* new RuthCloudError({ runId, reason: "The task model is not registered." });
      const name = modelName as (typeof RUTH_MODEL_NAMES)[number];
      const now = yield* DateTime.now;
      yield* database.use((db) =>
        db
          .update(cloudRun)
          .set({
            status: "provisioning",
            leasedBy: leaseOwner,
            heartbeatAt: sql`now()`,
            leaseExpiresAt: sql`now() + interval '5 minutes'`,
            startedAt: run.startedAt ?? DateTime.toDateUtc(now),
            modelName: name,
            promptVersion: "server-cua-v1",
          })
          .where(
            and(
              ownedWhere,
              run.leasedBy
                ? eq(cloudRun.leasedBy, run.leasedBy)
                : sql`${cloudRun.leasedBy} is null`,
              inArray(cloudRun.status, ["scheduled", "provisioning", "running"]),
            ),
          ),
      );
      // Heartbeat is scoped to this executor, and cancellation interrupts its model/tool program.
      const heartbeat = Effect.gen(function* () {
        yield* cancelled();
        const rows = yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ heartbeatAt: sql`now()`, leaseExpiresAt: sql`now() + interval '5 minutes'` })
            .where(fencedWhere)
            .returning({ id: cloudRun.id }),
        );
        if (!rows.length) return yield* new LeaseLost({});
      });
      const work = Effect.gen(function* () {
        // Open the stream before provisioning so a watcher sees the run begin immediately.
        yield* deliver((log) => log.begin);
        yield* logStep("ensure workspace");
        boxStartedAt = yield* Clock.currentTimeMillis;
        box = yield* boxes.ensure(userId, task!.network);
        const inputRoot = yield* inputsRootFor({ userId });
        yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ sandboxId: box!.id, inputsSlug: inputRoot.split("/").at(-1)! })
            .where(fencedWhere),
        );
        const paths = runPaths(runId);
        yield* box.exec(`mkdir -p ${shellQuote(paths.outDir)}`);
        yield* box.startDesktop;
        recordingReachable = run.sandboxId === null || run.sandboxId === box.id;
        const ctx = {
          agent: "ruth-cloud" as const,
          userId,
          runId,
          fullAccess: false,
          leaseOwner,
          timeZone: task!.timeZone,
        };
        if (!run.messages.length) {
          for (const [index, rule] of task!.preHydration.entries()) {
            yield* cancelled();
            const result = yield* hydrateRule(
              { ...ctx, toolCallId: `pre-hydration-${index}` },
              rule,
              "pre-hydration",
            ).pipe(Effect.provideContext(hydrationServices), Effect.result);
            if (result._tag === "Success") hydrations.push(result.success);
            else hydrationFailures.push("A pre-hydration rule could not complete.");
          }
        }
        const checkpoint: LoopCheckpoint = {
          messages: run.messages.length
            ? run.messages
            : [
                {
                  role: "user",
                  content: makeRunPrompt({
                    taskPrompt: task!.prompt,
                    timeZone: task!.timeZone,
                    date: DateTime.formatIsoDate(
                      DateTime.makeZonedUnsafe(now, { timeZone: task!.timeZone }),
                    ),
                    outDir: paths.outDir,
                    hydrations,
                    hydrationFailures,
                  }),
                },
              ],
          stepIndex: run.stepIndex,
          usage: run.usage,
        };
        yield* database.use((db) =>
          db
            .update(cloudRun)
            .set({ status: "running", messages: checkpoint.messages })
            .where(fencedWhere),
        );
        const capabilities = models.capabilities(name);
        const images = createImageTransport(capabilities, models.maxImages);
        const completedTools = yield* database.use((db) =>
          db.query.cloudToolCall.findMany({
            where: and(
              eq(cloudToolCall.runId, runId),
              eq(cloudToolCall.name, "computer"),
              eq(cloudToolCall.status, "completed"),
            ),
            orderBy: [desc(cloudToolCall.createdAt)],
            limit: models.maxImages,
          }),
        );
        for (const record of completedTools.toReversed())
          if (record.status === "completed") images.attach(record.result);
        const computer = makeComputerRegistry(
          capabilities.screenProfile,
          options.maxActions ?? 500,
          run.usage.actions,
        );
        const base = Object.fromEntries(
          (["search_materials", "list_files", "find_files", "read_file"] as RuthToolName[]).map(
            (key) => [
              key,
              {
                spec: RUTH_TOOL_SPECS[key],
                policy: RUTH_TOOL_POLICY[key],
                execute: ruthKitTools[key] as ToolRegistration<RuthToolServices>["execute"],
              },
            ],
          ),
        );
        const registry = withToolJournal<CloudToolServices | RuthToolServices | ComputerServices>({
          ...base,
          ...cloudToolRegistrations,
          ...computer.registry,
          ...recordingRegistry,
          publish_asset: sandboxToolRegistry.publish_asset,
        });
        const agent = createAgent({
          kind: "ruth-cloud",
          models,
          name,
          bindTools: () =>
            toAiSdkTools<CloudToolServices | RuthToolServices | ComputerServices>(
              [
                "search_materials",
                "list_files",
                "find_files",
                "read_file",
                ...Object.keys(registry),
              ],
              ctx,
              services,
              registry,
              images,
            ),
        });
        const deadline = (run.startedAt?.getTime() ?? now.epochMilliseconds) + RUN_WALL_CLOCK;
        const result = yield* runCloudLoop({
          model: agent.model,
          system: agent.system,
          tools: agent.tools,
          images,
          capabilities,
          checkpoint,
          deadline,
          maxActions: options.maxActions ?? 500,
          maxCost: options.maxCost ?? 5,
          check: () => cancelled().pipe(Effect.asVoid),
          emit,
          save: (state) =>
            database
              .useTransaction(async (tx) => {
                const rows = await tx
                  .update(cloudRun)
                  .set({
                    messages: state.messages,
                    stepIndex: state.stepIndex,
                    usage: { ...state.usage, actions: computer.actions() },
                  })
                  .where(fencedWhere)
                  .returning({ id: cloudRun.id });
                if (!rows.length) return false;
                for (const call of pendingToolCalls(state.messages)) {
                  // eslint-disable-next-line no-await-in-loop -- Tool intents commit atomically with this step's messages and usage.
                  await tx
                    .insert(cloudToolCall)
                    .values({
                      runId,
                      toolCallId: call.toolCallId,
                      name: call.toolName,
                      status: "pending",
                      input: call.input,
                    })
                    .onConflictDoNothing();
                }
                return true;
              })
              .pipe(
                Effect.flatMap((saved) => (saved ? Effect.void : Effect.fail(new LeaseLost({})))),
              ),
        });
        const current = yield* cancelled();
        if (current.error) return yield* new RuthCloudError({ runId, reason: current.error });
        yield* finishReport("succeeded", current.summary ?? result.text ?? "Ruth Cloud finished.");
      });
      const remaining = Math.max(
        1,
        (run.startedAt?.getTime() ?? now.epochMilliseconds) +
          RUN_WALL_CLOCK -
          (yield* Clock.currentTimeMillis),
      );
      yield* Effect.raceFirst(work, Effect.repeat(heartbeat, Schedule.spaced("30 seconds"))).pipe(
        Effect.timeoutOrElse({
          duration: remaining,
          orElse: () =>
            Effect.fail(
              new CloudLoopError({ reason: "The run exceeded its four-hour wall-clock limit." }),
            ),
        }),
      );
    });
    yield* program.pipe(
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          const error = Cause.findErrorOption(cause);
          const current = yield* snapshot();
          if (
            Cause.hasInterrupts(cause) ||
            (Option.isSome(error) && error.value instanceof LeaseLost)
          ) {
            // Worker shutdown is recoverable: keep recorder/commands/box and messages intact.
            yield* database.use((db) =>
              db
                .update(cloudRun)
                .set({ leaseExpiresAt: sql`now()` })
                .where(fencedWhere),
            );
            return;
          }
          if (current?.leasedBy !== leaseOwner) return;
          const cancelledRun =
            current.status === "cancelled" ||
            (Option.isSome(error) && error.value instanceof RunCancelled);
          const retryableFailure =
            Option.isSome(error) &&
            typeof error.value === "object" &&
            error.value !== null &&
            "_tag" in error.value &&
            (["CloudError", "SandboxUnavailable"].includes(String(error.value._tag)) ||
              (error.value instanceof CloudLoopError && error.value.retryable));
          const failures = current.usage.resumeFailures ?? 0;
          if (!cancelledRun && task && retryableFailure && failures + 1 < task.maxAttempts) {
            yield* database.use((db) =>
              db
                .update(cloudRun)
                .set({
                  usage: { ...current.usage, resumeFailures: failures + 1 },
                  leaseExpiresAt: sql`now() + interval '5 minutes'`,
                })
                .where(fencedWhere),
            );
            yield* Effect.logWarning("Ruth Cloud will resume after an infrastructure failure", {
              runId,
              failures: failures + 1,
            });
            return;
          }
          yield* finishReport(
            cancelledRun ? "cancelled" : "failed",
            current.summary ?? "Ruth Cloud could not finish this task.",
            cancelledRun
              ? undefined
              : Option.isSome(error) &&
                  typeof error.value === "object" &&
                  error.value !== null &&
                  "reason" in error.value
                ? String(error.value.reason)
                : "The Cloud executor failed.",
          );
        }),
      ),
    );
    const current = yield* snapshot();
    if (current && ["succeeded", "failed", "cancelled"].includes(current.status))
      yield* finishCleanup();
  });
  return RuthCloud.of({
    execute: (runId) =>
      execute(runId).pipe(
        Effect.provideContext(services),
        Effect.mapError((cause) =>
          cause instanceof RuthCloudError
            ? cause
            : new RuthCloudError({ runId, reason: "The Cloud executor failed.", cause }),
        ),
      ),
  });
});
export const RuthCloudLive = Layer.effect(
  RuthCloud,
  Effect.gen(function* () {
    const appUrl = yield* Config.String("APP_URL").pipe(
      Config.withDefault("https://avenire.space"),
    );
    const maxCost = yield* Config.Number("RUTH_CLOUD_MAX_COST_USD").pipe(Config.withDefault(5));
    return yield* makeRuthCloud({ appUrl, maxCost });
  }),
).pipe(Layer.provide(RuthModelsLive));
