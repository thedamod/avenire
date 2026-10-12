import { expect, it } from "@effect/vitest";
import { MockLanguageModelV4 } from "ai/test";
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
import { RuthModels } from "../models/index.ts";
import { AssetStore } from "../outputs/assets.ts";
import { AssetStoreTest } from "../outputs/asset-test-support.ts";
import { fakeCrypto, recordingDatabase } from "../cloud-test-support.ts";
import type { CloudToolServices } from "../cloud/tools.ts";
import type { RuthToolServices } from "../tools/ruth.ts";
import type { ComputerServices } from "../tools/computer.ts";

it.effect("runs the server model, publishes one report/video, and cleans/meters once", () => {
  const db = recordingDatabase();
  db.rows("user").push({
    id: "owner",
    name: "Owner",
    email: "owner@example.test",
    cloudInputsSlug: null,
  });
  let recordingStarted = false;
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
    recordings: Effect.sync(() =>
      recordingStarted ? [{ id: "recording", name: "ruth-run.mp4", state: "stopped" }] : [],
    ),
    startRecording: () =>
      Effect.sync(() => {
        recordingStarted = true;
        return Option.some("recording");
      }),
    stopRecording: (id, path) =>
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
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolName: "publish_report",
            toolCallId: "report-1",
            input: '{"markdown":"Finished"}',
          },
        ],
        usage,
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        warnings: [],
      },
      {
        content: [{ type: "text", text: "Done" }],
        usage,
        finishReason: { unified: "stop", raw: "stop" },
        warnings: [],
      },
    ],
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
    yield* executor.execute(CloudRunId.make("run"));
    expect(db.rows("cloud_run")[0]).toMatchObject({
      status: "succeeded",
      summary: "Finished",
      leasedBy: null,
      usage: { cleanupComplete: true, boxMetered: true, inputTokens: 10 },
    });
    expect(db.rows("ruth_message")).toHaveLength(1);
    expect(db.rows("email_outbox")).toHaveLength(1);
    const assets = yield* AssetStore;
    expect(
      (yield* assets.list(UserId.make("owner"), { runId: CloudRunId.make("run") }))[0],
    ).toMatchObject({ kind: "video", sizeBytes: 13 });
    yield* executor.execute(CloudRunId.make("run"));
    expect(recordingStops).toBe(1);
    expect(boxStops).toBe(1);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(db.rows("ruth_message")).toHaveLength(1);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provide(AnalyticsNoop));
});
