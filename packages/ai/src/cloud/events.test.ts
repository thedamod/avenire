import { describe, expect, it } from "@effect/vitest";
import { CloudRunId, NotFound, UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import type { UIMessageChunk } from "ai";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import { recordingDatabase } from "../cloud-test-support.ts";
import {
  CloudRunEvents,
  CloudRunEventsLive,
  RunEventConflict,
  coalesceChunks,
  makeRunEventWriter,
} from "./events.ts";

const runId = CloudRunId.make("run");
const owner = UserId.make("owner");
const text = (id: string, delta: string): UIMessageChunk => ({ type: "text-delta", id, delta });
const fixture = (status: string = "running") => {
  const db = recordingDatabase();
  db.rows("cloud_run").push({ id: "run", userId: "owner", status, error: null });
  const layer = CloudRunEventsLive.pipe(Layer.provideMerge(Layer.succeed(Database, db.database)));
  const read = (stream: ReadableStream<UIMessageChunk>) =>
    Effect.promise(() => Array.fromAsync(stream));
  return { db, layer, read };
};

describe("Cloud run event log", () => {
  it("coalesces token deltas of one part into a single row", () => {
    expect(
      coalesceChunks([
        { type: "text-start", id: "a" },
        text("a", "Hel"),
        text("a", "lo"),
        text("b", "!"),
      ]),
    ).toEqual([{ type: "text-start", id: "a" }, text("a", "Hello"), text("b", "!")]);
  });

  it.effect("appends densely, resumes the sequence after a restart and ends exactly once", () => {
    const { db } = fixture();
    return Effect.gen(function* () {
      const first = yield* makeRunEventWriter(runId);
      yield* first.begin;
      yield* first.append([{ type: "text-start", id: "a" }, text("a", "x"), text("a", "y")]);
      // A restarted executor continues the same message and sequence.
      const resumed = yield* makeRunEventWriter(runId);
      yield* resumed.begin;
      yield* resumed.append([{ type: "finish-step" }]);
      yield* resumed.end([{ type: "finish", finishReason: "stop" }]);
      yield* resumed.end([{ type: "finish", finishReason: "stop" }]);
      const log = db.rows("cloud_run_event");
      expect(log.map((row) => row.seq)).toEqual([0, 1, 2, 3, 4]);
      expect(log.map((row) => (row.chunk as UIMessageChunk).type)).toEqual([
        "start",
        "text-start",
        "text-delta",
        "finish-step",
        "finish",
      ]);
      expect(log.filter((row) => row.terminal)).toHaveLength(1);
      // The first writer no longer holds the sequence: its append is rejected, not interleaved.
      const stale = yield* Effect.flip(first.append([{ type: "finish-step" }]));
      expect(stale).toBeInstanceOf(RunEventConflict);
      expect(db.rows("cloud_run_event")).toHaveLength(5);
    }).pipe(Effect.provideService(Database, db.database));
  });

  it.effect("replays from any sequence, closes on the terminal row and checks ownership", () => {
    const { db, layer, read } = fixture("succeeded");
    return Effect.gen(function* () {
      const writer = yield* makeRunEventWriter(runId);
      yield* writer.begin;
      yield* writer.append([{ type: "start-step" }, { type: "finish-step" }]);
      yield* writer.end([{ type: "finish", finishReason: "stop" }]);
      const events = yield* CloudRunEvents;
      const types = (chunks: UIMessageChunk[]) => chunks.map((chunk) => chunk.type);
      expect(types(yield* read(yield* events.stream(owner, runId)))).toEqual([
        "start",
        "start-step",
        "finish-step",
        "finish",
      ]);
      expect(types(yield* read(yield* events.stream(owner, runId, 2)))).toEqual([
        "finish-step",
        "finish",
      ]);
      const stranger = yield* Effect.flip(events.stream(UserId.make("other"), runId));
      expect(stranger).toBeInstanceOf(NotFound);
    }).pipe(Effect.provide(layer), Effect.provideService(Database, db.database));
  });

  it.effect("closes a run that never wrote a terminal row (cancelled while queued)", () => {
    const { layer, read } = fixture("cancelled");
    return Effect.gen(function* () {
      const events = yield* CloudRunEvents;
      expect(yield* read(yield* events.stream(owner, runId))).toEqual([
        { type: "abort", reason: "The run was cancelled." },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.live("tails a running run from a resumed offset until it ends", () => {
    const { db, layer, read } = fixture("running");
    return Effect.gen(function* () {
      const writer = yield* makeRunEventWriter(runId);
      yield* writer.begin;
      yield* writer.append([{ type: "start-step" }]);
      const events = yield* CloudRunEvents;
      const tail = yield* Effect.forkChild(read(yield* events.stream(owner, runId, 1)));
      yield* Effect.sleep("150 millis");
      yield* writer.append([{ type: "finish-step" }]);
      yield* writer.end([{ type: "finish", finishReason: "stop" }]);
      const chunks = yield* Fiber.join(tail);
      expect(chunks.map((chunk) => chunk.type)).toEqual(["start-step", "finish-step", "finish"]);
    }).pipe(Effect.provide(layer), Effect.provideService(Database, db.database));
  });
});
