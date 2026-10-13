import { expect, it } from "@effect/vitest";
import { CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import { CloudError } from "@avenire/cloud/daytona";
import { CloudRunId, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
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

const setup = (options: { leftRecording: boolean }) => {
  const db = recordingDatabase();
  db.rows("user").push({
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    cloudInputsSlug: null,
  });
  let recordingsStarted = 0;
  let recordingStops = 0;
  let boxStops = 0;
  const box: CloudBox = {
    id: "sandbox",
    userId: "owner",
    sandbox: {} as CloudBox["sandbox"],
    exec: () => Effect.succeed({ exitCode: 0, output: "" }),
    writeFile: () => Effect.void,
    readFile: () => Effect.succeed(new Uint8Array()),
    fileInfo: () => Effect.succeed(Option.none()),
    removeFile: () => Effect.void,
    startCommand: () => Effect.die("unused"),
    commandStatus: () => Effect.die("unused"),
    commandLogs: () => Effect.die("unused"),
    endSession: () => Effect.void,
    startDesktop: Effect.void,
    recordings: Effect.succeed(
      options.leftRecording ? [{ id: "recording", name: "ruth-run.mp4", state: "recording" }] : [],
    ),
    startRecording: () =>
      Effect.sync(() => {
        recordingsStarted++;
        return Option.none<string>();
      }),
    stopRecording: (_id, path) =>
      Effect.tryPromise({
        try: async () => {
          recordingStops++;
          await writeFile(path, "video fixture");
        },
        catch: (cause) => new CloudError({ operation: "fakeRecording", cause }),
      }),
  };
  const boxes = CloudBoxes.of({
    ensure: () => Effect.succeed(box),
    running: () => Effect.succeed(Option.some(box)),
    stop: () =>
      Effect.sync(() => {
        boxStops++;
      }),
  });
  const model = scriptedModel([
    { toolCalls: [{ id: "report-1", name: "publish_report", input: '{"markdown":"Finished"}' }] },
  ]);
  return { db, box, boxes, model, counts: () => ({ recordingsStarted, recordingStops, boxStops }) };
};
const run = (options: { leftRecording: boolean }) => {
  const { db, boxes, model, counts } = setup(options);
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
      Context.add(Database, db.database),
      Context.add(CloudBoxes, boxes),
      Context.add(Crypto.Crypto, fakeCrypto),
      Context.add(
        RuthModels,
        RuthModels.of({
          languageModel: () => model,
          capabilities: () => ({ vision: true, toolResultImages: true }),
          maxImages: 1,
        }),
      ),
    ) as Context.Context<CloudToolServices | RuthToolServices | ComputerServices | RuthModels>;
    const executor = yield* makeRuthCloud({ appUrl: "https://app.test" }).pipe(
      Effect.provideContext(services),
    );
    // A claim whose lease was since reclaimed by another worker must not touch the run.
    yield* executor.execute({ runId: CloudRunId.make("run"), lease: "stale" });
    expect(db.rows("cloud_run")[0]).toMatchObject({ status: "provisioning", leasedBy: "worker" });
    yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    expect(db.rows("cloud_run")[0]).toMatchObject({
      status: "succeeded",
      summary: "Finished",
      leasedBy: null,
      usage: { cleanupComplete: true, inputTokens: 10 },
    });
    expect(db.rows("ruth_message")).toHaveLength(1);
    expect(db.rows("email_outbox")).toHaveLength(1);
    const assets = yield* AssetStore;
    const stored = yield* assets.list(UserId.make("owner"), { runId: CloudRunId.make("run") });
    yield* executor.execute({ runId: CloudRunId.make("run"), lease: "worker" });
    // The executor never starts a recording; it only finalises one the agent left running.
    expect(counts()).toMatchObject({ recordingsStarted: 0, boxStops: 1 });
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
