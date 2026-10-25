import { expect, it } from "@effect/vitest";
import { CloudError } from "@avenire/cloud/daytona";
import { CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import { CloudRunId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { Mailer, type SendRequest } from "@avenire/emailer/mailer";
import type { TemplateName } from "@avenire/emailer/templates";
import { cloudRun, cloudTask } from "@avenire/database/schema";
import { Analytics, AnalyticsNoop } from "@avenire/shared/observability";
import { Storage } from "@avenire/storage/storage";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { writeFile } from "node:fs/promises";
import { makeRuthCloud } from "./cloud.ts";
import { scriptedModel } from "./conformance.ts";
import { RuthModels } from "../models/index.ts";
import { AssetStore } from "../outputs/assets.ts";
import { AssetStoreTest } from "../outputs/asset-test-support.ts";
import { fakeCrypto, recordingDatabase } from "../cloud-test-support.ts";
import type { CloudToolServices } from "../cloud/tools.ts";
import type { RuthToolServices } from "../tools/ruth.ts";
import type { ComputerServices } from "../tools/computer.ts";

const setup = (options: {
  leftRecording: boolean;
  lostDeleteResponse?: boolean;
  cleanupStopFailure?: boolean;
}) => {
  const db = recordingDatabase();
  db.rows("user").push({
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    cloudInputsSlug: null,
  });
  let recordingsStarted = 0;
  let recordingStops = 0;
  let deleteFailed = false;
  let boxStops = 0;
  const recordings = options.leftRecording
    ? [{ id: "recording", fileName: "ruth-run.mp4", status: "recording" }]
    : [];
  const box: CloudBox = {
    id: "sandbox",
    userId: "owner",
    sandbox: {
      computerUse: {
        start: async () => {},
        recording: {
          start: async () => {
            recordingsStarted++;
            return { id: "recording", fileName: "ruth-run.mp4", status: "recording" };
          },
          list: async () => ({ recordings: recordings.slice() }),
          get: async () => recordings[0],
          stop: async () => {
            recordingStops++;
            recordings[0]!.status = "stopped";
            return recordings[0];
          },
          download: async (_id: string, path: string) => {
            await writeFile(path, "video fixture");
          },
          delete: async () => {
            recordings.splice(0);
            if (options.lostDeleteResponse && !deleteFailed) {
              deleteFailed = true;
              throw new Error("Remote deletion succeeded but its response was lost");
            }
          },
        },
      },
    } as unknown as CloudBox["sandbox"],
    exec: () => Effect.succeed({ exitCode: 0, output: "" }),
    writeFile: () => Effect.void,
    readFile: () => Effect.succeed(new Uint8Array()),
    fileInfo: () => Effect.succeed(Option.none()),
    removeFile: () => Effect.void,
    endSession: () => Effect.void,
    startDesktop: Effect.void,
  };
  const boxes = CloudBoxes.of({
    ensure: () => Effect.succeed(box),
    reconnect: () => Effect.succeed(Option.some(box)),
    running: () => Effect.succeed(Option.some(box)),
    stop: () =>
      Effect.suspend(() => {
        boxStops++;
        return options.cleanupStopFailure && boxStops === 1
          ? Effect.fail(new CloudError({ operation: "stop", detail: "response lost" }))
          : Effect.void;
      }),
  });
  const model = scriptedModel([
    { toolCalls: [{ id: "report-1", name: "publish_report", input: '{"markdown":"Finished"}' }] },
  ]);
  const sent: Array<SendRequest<TemplateName>> = [];
  const mailer = Mailer.of({
    send: (request) =>
      Effect.sync(() => {
        sent.push(request);
        return { id: `mail-${sent.length}` };
      }),
  });
  return {
    db,
    box,
    boxes,
    model,
    mailer,
    sent,
    counts: () => ({ recordingsStarted, recordingStops, boxStops }),
  };
};
const run = (options: {
  leftRecording: boolean;
  crashAfterExecution?: boolean;
  lostDeleteResponse?: boolean;
  cleanupStopFailure?: boolean;
}) => {
  const { db, boxes, model, mailer, sent, counts } = setup(options);
  let crash = options.crashAfterExecution;
  const database = Database.of({
    ...db.database,
    useTransaction: (fn) =>
      db.database.useTransaction(fn).pipe(
        Effect.flatMap((value) => {
          const current = db.rows("cloud_run")[0];
          if (
            crash &&
            (current?.usage as { execution?: unknown } | undefined)?.execution &&
            !current?.reportMessageId
          ) {
            crash = false;
            return Effect.interrupt;
          }
          return Effect.succeed(value);
        }),
      ),
  });
  return Effect.gen(function* () {
    yield* db.database.use((client) =>
      client.insert(cloudTask).values({
        id: "task",
        userId: "owner",
        title: "Study",
        prompt: "Study",
        schedule: { _tag: "once", at: "1970-01-01T00:00:00Z" },
        delivery: { email: true },
      }),
    );
    yield* db.database.use((client) =>
      client.insert(cloudRun).values({
        id: "run",
        userId: "owner",
        taskId: "task",
        scheduledFor: new Date(0),
        status: "provisioning",
        leasedBy: "worker",
        // What screen_record journals while the agent is recording.
        recordingId: options.leftRecording ? "recording" : null,
      }),
    );
    const services = (yield* Effect.context<AssetStore | Storage | Analytics>()).pipe(
      Context.add(Database, database),
      Context.add(CloudBoxes, boxes),
      Context.add(Mailer, mailer),
      Context.add(Crypto.Crypto, fakeCrypto),
      Context.add(
        RuthModels,
        RuthModels.of({
          languageModel: () => model,
          capabilities: () => ({ vision: true, toolResultImages: true }),
          maxImages: 1,
        }),
      ),
    ) as Context.Context<
      CloudToolServices | RuthToolServices | ComputerServices | RuthModels | Mailer
    >;
    const executor = yield* makeRuthCloud({ appUrl: "https://app.test" }).pipe(
      Effect.provideContext(services),
    );
    // A claim whose lease was since reclaimed by another worker must not touch the run.
    yield* executor.execute({ runId: CloudRunId.make("run"), lease: "stale" });
    expect(db.rows("cloud_run")[0]).toMatchObject({ status: "provisioning", leasedBy: "worker" });
    if (options.cleanupStopFailure) {
      const failed = yield* Effect.result(
        executor.execute({ runId: CloudRunId.make("run"), lease: "worker" }),
      );
      expect(failed._tag).toBe("Failure");
      expect(db.rows("cloud_run")[0]).toMatchObject({ status: "succeeded", leasedBy: "worker" });
      expect(db.rows("ruth_message")).toHaveLength(1);
      yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    } else yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    if (options.crashAfterExecution || options.lostDeleteResponse) {
      expect(db.rows("cloud_run")[0]).toMatchObject({
        status: "running",
        usage: { execution: { status: "completed", text: "Finished" } },
      });
      expect(db.rows("ruth_message")).toHaveLength(0);
      yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    }
    expect(db.rows("cloud_run")[0]).toMatchObject({
      status: "succeeded",
      summary: "Finished",
      leasedBy: null,
      usage: { cleanupComplete: true, inputTokens: 10 },
    });
    expect(db.rows("ruth_message")).toHaveLength(1);
    // The report email goes out once, from the attempt that posted the report.
    expect(sent).toMatchObject([
      {
        to: "owner@example.test",
        template: "morning-digest",
        idempotencyKey: "cloud-run-run",
        props: { name: "Owner", taskTitle: "Study" },
      },
    ]);
    expect(db.rows("cloud_run")[0]?.recordingId).toBeNull();
    const assets = yield* AssetStore;
    const stored = yield* assets.list(UserId.make("owner"), { runId: CloudRunId.make("run") });
    yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    // Replaying a finished run must not email again.
    expect(sent).toHaveLength(1);
    // The executor never starts a recording; it only finalises one the agent left running.
    expect(counts()).toMatchObject({
      recordingsStarted: 0,
      boxStops: options.lostDeleteResponse || options.cleanupStopFailure ? 2 : 1,
    });
    if (options.leftRecording) {
      expect(stored).toMatchObject([{ kind: "video", sizeBytes: 13 }]);
      expect(counts().recordingStops).toBe(1);
    } else {
      expect(stored).toHaveLength(0);
      expect(counts().recordingStops).toBe(0);
    }
    expect(model.doStreamCalls).toHaveLength(1);
    expect(db.rows("ruth_message")).toHaveLength(1);
    // The durable event log: one start, the steps and tool result, and exactly one terminal row.
    const log = db.rows("cloud_run_event").toSorted((a, b) => Number(a.seq) - Number(b.seq));
    expect(log.map((row) => Number(row.seq))).toEqual(log.map((_, index) => index));
    expect(log[0]).toMatchObject({ chunk: { type: "start", messageId: "run" } });
    if (!options.crashAfterExecution)
      expect(
        log.some((row) => (row.chunk as { type: string }).type === "tool-output-available"),
      ).toBe(true);
    expect(log.filter((row) => row.terminal)).toHaveLength(1);
    expect(log.at(-1)).toMatchObject({
      terminal: true,
      chunk: { type: "finish", finishReason: "stop" },
    });
  }).pipe(Effect.provide(AssetStoreTest), Effect.provide(AnalyticsNoop));
};
it.effect("streams a run to the event log, publishes one report and cleans up once", () =>
  run({ leftRecording: false }),
);
it.effect("finalises only a recording the agent left running", () => run({ leftRecording: true }));

it.effect(
  "resumes a committed completed checkpoint with no additional model calls or reports",
  () => run({ leftRecording: false, crashAfterExecution: true }),
);

it.effect(
  "recovers remote recording deletion before report commit without another model, upload or email",
  () => run({ leftRecording: true, lostDeleteResponse: true }),
);

it.effect(
  "replays terminal cleanup after box stop failure without duplicating report, email or recording",
  () => run({ leftRecording: true, cleanupStopFailure: true }),
);
