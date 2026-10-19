import { expect, it } from "@effect/vitest";
import { CloudBoxes } from "@avenire/cloud/cloud-box";
import { ChatSandboxes } from "@avenire/cloud/chat-sandbox";
import { CloudRunId, ThreadId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { writeFile } from "node:fs/promises";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { recordingDatabase } from "../cloud-test-support.ts";
import { AssetStore } from "../outputs/assets.ts";
import { AssetStoreTest } from "../outputs/asset-test-support.ts";
import { screenRecord, type RecordingInfo, type RecordingSandbox } from "./recording.ts";
import { ctx, testCrypto } from "./test-support.ts";

/** A Daytona recorder with the SDK's semantics: start lists an active file, stop finishes it. */
const fakeSandbox = () => {
  const recordings: Array<RecordingInfo & { durationSeconds?: number }> = [];
  const calls: string[] = [];
  const sandbox: RecordingSandbox = {
    computerUse: {
      start: async () => {
        calls.push("desktop");
      },
      recording: {
        start: async (label) => {
          calls.push("start");
          const recording = {
            id: `rec-${recordings.length + 1}`,
            fileName: `${label}.mp4`,
            status: "recording",
          };
          recordings.push(recording);
          return recording;
        },
        stop: async (id) => {
          calls.push("stop");
          const recording = recordings.find((r) => r.id === id)!;
          Object.assign(recording, { status: "stopped", durationSeconds: 42 });
          return recording;
        },
        list: async () => ({ recordings }),
        get: async (id) => recordings.find((r) => r.id === id)!,
        delete: async (id) => {
          calls.push("delete");
          recordings.splice(
            recordings.findIndex((r) => r.id === id),
            1,
          );
        },
        download: async (_id, path) => {
          calls.push("download");
          await writeFile(path, "mp4 bytes");
        },
      },
    },
  };
  return { sandbox, recordings, calls };
};
const services = (sandbox: RecordingSandbox, db = recordingDatabase()) =>
  Context.empty().pipe(
    Context.add(
      ChatSandboxes,
      ChatSandboxes.of({ target: () => Effect.succeed(sandbox) } as never),
    ),
    Context.add(
      CloudBoxes,
      CloudBoxes.of({ running: () => Effect.succeed(Option.some({ sandbox })) } as never),
    ),
    Context.add(Database, db.database),
    Context.add(Crypto.Crypto, testCrypto),
  );
const threadId = ThreadId.make("thread");

it.effect("chat: starts once, stops into a private video asset and frees the box", () => {
  const { sandbox, recordings, calls } = fakeSandbox();
  const chat = { ...ctx, threadId };
  return Effect.gen(function* () {
    const run = (action: "start" | "stop", label?: string) =>
      screenRecord.execute({ action, ...(label ? { label } : {}) }, chat);
    const started = yield* run("start", "demo");
    expect(started).toMatchObject({ action: "start", alreadyRecording: false });
    // A second start reports the recording that is already running instead of starting another.
    expect(yield* run("start")).toMatchObject({ alreadyRecording: true });
    expect(calls.filter((call) => call === "start")).toHaveLength(1);
    const stopped = yield* run("stop", "My demo");
    expect(stopped).toMatchObject({ action: "stop", durationSeconds: 42 });
    const [asset] = yield* (yield* AssetStore).list(chat.userId, { threadId });
    expect(asset).toMatchObject({ kind: "video", title: "My demo", sizeBytes: 9 });
    expect(recordings).toHaveLength(0);
    const again = yield* Effect.flip(run("stop"));
    expect(again).toMatchObject({ code: "not_found" });
  }).pipe(Effect.provide(AssetStoreTest), Effect.provide(services(sandbox)));
});

it.effect("cloud: journals the recording id and replays a stop without a second asset", () => {
  const db = recordingDatabase();
  db.rows("cloud_run").push({ id: "run", userId: ctx.userId, recordingId: null });
  const { sandbox, calls } = fakeSandbox();
  const cloud = {
    ...ctx,
    agent: "ruth-cloud" as const,
    runId: CloudRunId.make("run"),
    toolCallId: "stop-call",
  };
  return Effect.gen(function* () {
    yield* screenRecord.execute({ action: "start" }, { ...cloud, toolCallId: "start-call" });
    expect(db.rows("cloud_run")[0]).toMatchObject({ recordingId: "rec-1" });
    const first = yield* screenRecord.execute({ action: "stop" }, cloud);
    expect(db.rows("cloud_run")[0]).toMatchObject({ recordingId: "rec-1" });
    // The worker died after the upload but before the journal: the same call id finds the asset.
    const replay = yield* screenRecord.execute({ action: "stop" }, cloud);
    expect(replay).toMatchObject({
      action: "stop",
      assetId: (first as { assetId: string }).assetId,
    });
    expect(calls.filter((call) => call === "download")).toHaveLength(1);
    expect(yield* (yield* AssetStore).list(cloud.userId, { runId: cloud.runId })).toHaveLength(1);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provide(services(sandbox, db)));
});

it.effect("recovers the recording journal when start succeeded before the worker crashed", () => {
  const db = recordingDatabase();
  db.rows("cloud_run").push({ id: "run", userId: ctx.userId, recordingId: null });
  const { sandbox, calls } = fakeSandbox();
  const cloud = {
    ...ctx,
    agent: "ruth-cloud" as const,
    runId: CloudRunId.make("run"),
    toolCallId: "start-call",
  };
  return Effect.gen(function* () {
    // Simulate Daytona committing start while its response/journal is lost.
    yield* Effect.promise(() => sandbox.computerUse.recording.start("ruth-run-start-call"));
    const resumed = yield* screenRecord.execute({ action: "start" }, cloud);
    expect(resumed).toMatchObject({ recordingId: "rec-1", alreadyRecording: true });
    expect(db.rows("cloud_run")[0]).toMatchObject({ recordingId: "rec-1" });
    expect(calls.filter((call) => call === "start")).toHaveLength(1);
    yield* screenRecord.execute({ action: "stop" }, cloud);
    expect(yield* (yield* AssetStore).list(cloud.userId, { runId: cloud.runId })).toHaveLength(1);
  }).pipe(Effect.provide(AssetStoreTest), Effect.provide(services(sandbox, db)));
});

it.effect(
  "retains the recording journal across remote deletion failure and retries without reupload",
  () => {
    const db = recordingDatabase();
    db.rows("cloud_run").push({ id: "run", userId: ctx.userId, recordingId: null });
    const { sandbox, recordings, calls } = fakeSandbox();
    const cloud = {
      ...ctx,
      agent: "ruth-cloud" as const,
      runId: CloudRunId.make("run"),
      toolCallId: "stop",
    };
    const remove = sandbox.computerUse.recording.delete;
    let failDelete = true;
    Object.assign(sandbox.computerUse.recording, {
      delete: async (id: string) => {
        if (failDelete) {
          failDelete = false;
          throw new Error("delete failed");
        }
        await remove(id);
      },
    });
    return Effect.gen(function* () {
      yield* screenRecord.execute({ action: "start" }, cloud);
      const failure = yield* Effect.result(screenRecord.execute({ action: "stop" }, cloud));
      expect(failure).toMatchObject({ _tag: "Failure", failure: { checkpointFatal: true } });
      expect(db.rows("cloud_run")[0]).toMatchObject({ recordingId: "rec-1" });
      expect(recordings).toHaveLength(1);
      yield* screenRecord.execute({ action: "stop" }, cloud);
      expect(recordings).toHaveLength(0);
      expect(calls.filter((call) => call === "download")).toHaveLength(1);
      expect(calls.filter((call) => call === "stop")).toHaveLength(1);
      expect(yield* (yield* AssetStore).list(cloud.userId, { runId: cloud.runId })).toHaveLength(1);
    }).pipe(Effect.provide(AssetStoreTest), Effect.provide(services(sandbox, db)));
  },
);

for (const boundary of ["stop", "upload", "delete"] as const) {
  it.effect(
    `reconciles a lost ${boundary} response with one asset and no premature remote deletion`,
    () => {
      const db = recordingDatabase();
      db.rows("cloud_run").push({ id: "run", userId: ctx.userId, recordingId: null });
      const { sandbox, recordings, calls } = fakeSandbox();
      const cloud = {
        ...ctx,
        agent: "ruth-cloud" as const,
        runId: CloudRunId.make("run"),
        toolCallId: "stop",
      };
      return Effect.gen(function* () {
        const assets = yield* AssetStore;
        let fail = true;
        const after = async <A>(action: () => Promise<A>) => {
          const result = await action();
          if (fail) {
            fail = false;
            throw new Error("response lost after side effect");
          }
          return result;
        };
        const recorder = sandbox.computerUse.recording;
        if (boundary === "stop") {
          const stop = recorder.stop;
          Object.assign(recorder, { stop: (id: string) => after(() => stop(id)) });
        }
        if (boundary === "delete") {
          const remove = recorder.delete;
          Object.assign(recorder, { delete: (id: string) => after(() => remove(id)) });
        }
        const uncertainAssets = AssetStore.of({
          ...assets,
          put: (userId, input) =>
            assets.put(userId, input).pipe(
              Effect.flatMap((asset) =>
                boundary === "upload" && fail
                  ? Effect.sync(() => {
                      fail = false;
                    }).pipe(Effect.andThen(Effect.fail(new Error("upload response lost"))))
                  : Effect.succeed(asset),
              ),
            ),
        } as AssetStore["Service"]);
        const stop = () =>
          screenRecord
            .execute({ action: "stop" }, cloud)
            .pipe(Effect.provideService(AssetStore, uncertainAssets));
        yield* screenRecord.execute({ action: "start" }, cloud);
        expect((yield* Effect.result(stop()))._tag).toBe("Failure");
        if (boundary !== "delete") expect(recordings).toHaveLength(1);
        if (boundary === "stop") expect(calls).not.toContain("delete");
        const resumed = yield* stop();
        expect(resumed).toMatchObject({ action: "stop" });
        expect(recordings).toHaveLength(0);
        expect(yield* assets.list(cloud.userId, { runId: cloud.runId })).toHaveLength(1);
        expect(calls.filter((call) => call === "stop")).toHaveLength(1);
        expect(calls.filter((call) => call === "download")).toHaveLength(1);
        expect(db.rows("cloud_run")[0]).toMatchObject({ recordingId: "rec-1" });
      }).pipe(Effect.provide(AssetStoreTest), Effect.provide(services(sandbox, db)));
    },
  );
}
