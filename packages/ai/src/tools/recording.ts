/**
 * `screen_record`: the agent decides when to record. One tool for chat (its thread sandbox) and
 * Cloud (its box); stop streams the MP4 from Daytona to a temp file, then into the private asset
 * store, never holding the file in memory.
 */
import { attempt } from "@avenire/cloud/daytona";
import { AssetId, type CloudRunId, type ThreadId, type UserId } from "@avenire/contracts";
import { Database } from "@avenire/database/client";
import { cloudRun } from "@avenire/database/schema";
import { and, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { stableToolId } from "../cloud/journal.ts";
import { AssetStore } from "../outputs/assets.ts";
import { COMPUTER_TOOL_SPECS } from "./computer-specs.ts";
import { targetFor, type ComputerServices } from "./computer.ts";
import { RuthToolError, type AgentContext } from "./core.ts";
import { registerTool, type ToolRegistration } from "./registration.ts";

/** The slice of the Daytona sandbox recording uses; the SDK's `Sandbox` satisfies it. */
export interface RecordingInfo {
  readonly id: string;
  readonly fileName: string;
  readonly status: string;
  readonly durationSeconds?: number | undefined;
}
export interface RecordingSandbox {
  readonly computerUse: {
    start(): Promise<unknown>;
    readonly recording: {
      start(label?: string): Promise<RecordingInfo>;
      stop(id: string): Promise<RecordingInfo>;
      list(): Promise<{ readonly recordings: ReadonlyArray<RecordingInfo> }>;
      get(id: string): Promise<RecordingInfo>;
      delete(id: string): Promise<void>;
      download(id: string, localPath: string): Promise<void>;
    };
  };
}
export type RecordingServices = ComputerServices | AssetStore | Crypto.Crypto;

/** Same set the Cloud box treats as already stopped. */
const STOPPED = new Set(["stopped", "completed", "finished"]);
const isActive = (recording: RecordingInfo) => !STOPPED.has(recording.status);
const fail = (message: string, code: RuthToolError["code"] = "failed") =>
  new RuthToolError({ tool: "screen_record", message, code, recoverable: true });

/** Streams one recording into the asset store and returns the stored asset. */
export const storeRecording = Effect.fn("Recording.store")(function* <E>(input: {
  /** Writes the stopped MP4 to the given local path (Daytona streams it straight to disk). */
  download: (localPath: string) => Effect.Effect<void, E>;
  userId: UserId;
  title: string;
  threadId?: ThreadId | undefined;
  runId?: CloudRunId | undefined;
  idempotencyId?: AssetId | undefined;
}) {
  const assets = yield* AssetStore;
  const directory = yield* attempt("recordingTempDir", () =>
    mkdtemp(`${tmpdir()}/ruth-recording-`),
  );
  const localPath = `${directory}/recording.mp4`;
  return yield* Effect.gen(function* () {
    yield* input.download(localPath);
    const source = yield* attempt("recordingRead", async () => {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(localPath)) hash.update(chunk);
      const info = await stat(localPath);
      return {
        stream: Readable.toWeb(createReadStream(localPath)) as ReadableStream<Uint8Array>,
        sizeBytes: info.size,
        contentHash: hash.digest("hex"),
      };
    });
    return yield* assets.put(input.userId, {
      name: "recording.mp4",
      title: input.title,
      bytes: source,
      mediaType: "video/mp4",
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.idempotencyId ? { idempotencyId: input.idempotencyId } : {}),
    });
  }).pipe(
    Effect.ensuring(
      Effect.promise(() => rm(directory, { recursive: true, force: true })).pipe(Effect.ignore),
    ),
  );
});

export const recordingScope = (ctx: Pick<AgentContext, "runId" | "threadId">) =>
  `ruth-${ctx.runId ?? ctx.threadId}`;

/** Chat has no journal: its recording is found by the deterministic per-thread label. */
export const findRecording = (
  list: ReadonlyArray<RecordingInfo>,
  scope: string,
  storedId: string | null,
) => list.find((r) => r.id === storedId) ?? list.findLast((r) => r.fileName.includes(scope));

/** Cloud journals the running recording so a resumed run can stop or finalise it. */
const journal = Effect.fn("Recording.journal")(function* (
  ctx: AgentContext,
  recordingId: string | null,
) {
  if (!ctx.runId) return;
  const database = yield* Database;
  const saved = yield* database.use((db) =>
    db
      .update(cloudRun)
      .set({ recordingId })
      .where(
        and(
          eq(cloudRun.id, ctx.runId!),
          eq(cloudRun.userId, ctx.userId),
          ...(ctx.leaseOwner ? [eq(cloudRun.leasedBy, ctx.leaseOwner)] : []),
        ),
      )
      .returning({ id: cloudRun.id }),
  );
  if (!saved.length)
    return yield* new RuthToolError({
      tool: "screen_record",
      code: "conflict",
      message: "The recording lease is no longer owned by this worker.",
      recoverable: false,
      checkpointFatal: true,
    });
});

/** One recording has one asset across explicit stops and executor recovery. The Cloud run retains
 * its recording id through delivery and cleanup, so every crash window can find this asset. */
export const finalizeRecording = Effect.fn("Recording.finalize")(function* (input: {
  sandbox: RecordingSandbox;
  recordingId: string;
  ctx: Pick<AgentContext, "userId" | "runId" | "threadId">;
  title: string;
}) {
  const { ctx, recordingId } = input;
  const assetId = AssetId.make(
    stableToolId(
      {
        ...(ctx.runId ? { runId: ctx.runId } : {}),
        toolCallId: `${ctx.runId ? "cloud" : ctx.threadId}:recording:${recordingId}`,
      },
      "asset",
    ),
  );
  const assets = yield* AssetStore;
  const prior = yield* assets.get(assetId);
  const recorder = input.sandbox.computerUse.recording;
  const listed = yield* attempt("recordingList", () => recorder.list());
  const current = listed.recordings.find((recording) => recording.id === recordingId);
  if (!current && Option.isNone(prior))
    return yield* fail("The recording is no longer available.", "not_found");
  const stopped =
    current && isActive(current)
      ? yield* attempt("recordingStop", () => recorder.stop(current.id))
      : current;
  const asset = Option.isSome(prior)
    ? prior.value
    : yield* storeRecording({
        download: (localPath) =>
          attempt("recordingDownload", () => recorder.download(recordingId, localPath)),
        userId: ctx.userId,
        title: input.title,
        threadId: ctx.threadId,
        runId: ctx.runId,
        idempotencyId: assetId,
      });
  // Do not clear the journal on delete failure: a later recovery must retry remote cleanup.
  if (current) yield* attempt("recordingDelete", () => recorder.delete(recordingId));
  return { asset, durationSeconds: stopped?.durationSeconds ?? 0 };
});

export const screenRecord = registerTool({
  spec: COMPUTER_TOOL_SPECS.screen_record,
  policy: { agents: ["ruth", "ruth-cloud"], approval: "never" },
  execute: Effect.fn("Recording.screenRecord")(function* (input, ctx) {
    const sandbox: RecordingSandbox = yield* targetFor(ctx);
    const scope = recordingScope(ctx);
    const recorder = sandbox.computerUse.recording;
    const listed = yield* attempt("recordingList", () => recorder.list());
    const storedId = ctx.runId
      ? ((yield* (yield* Database).use((db) =>
          db.query.cloudRun.findFirst({
            columns: { recordingId: true },
            where: and(eq(cloudRun.id, ctx.runId!), eq(cloudRun.userId, ctx.userId)),
          }),
        ))?.recordingId ?? null)
      : null;
    const current = findRecording(listed.recordings, scope, storedId);
    if (input.action === "start") {
      // A second start, or a resumed one, reports the recording that is already running.
      if (current && isActive(current)) {
        // A worker may have died after recorder.start succeeded but before journal committed.
        yield* journal(ctx, current.id);
        return { action: "start" as const, recordingId: current.id, alreadyRecording: true };
      }
      yield* attempt("computerStart", () => sandbox.computerUse.start());
      const started = yield* attempt("recordingStart", () =>
        recorder.start(`${scope}-${ctx.toolCallId ?? randomUUID().slice(0, 8)}`),
      );
      yield* journal(ctx, started.id);
      return { action: "start" as const, recordingId: started.id, alreadyRecording: false };
    }
    const id = current?.id ?? storedId;
    if (!id) return yield* fail("No recording is running.", "not_found");
    const { asset, durationSeconds } = yield* finalizeRecording({
      sandbox,
      recordingId: id,
      ctx,
      title: input.label?.trim() || "Screen recording",
    }).pipe(
      Effect.mapError((cause) =>
        ctx.runId
          ? new RuthToolError({
              tool: "screen_record",
              message: "Recording finalization is incomplete. Resume this call before continuing.",
              code: "failed",
              recoverable: false,
              checkpointFatal: true,
            })
          : cause,
      ),
    );
    // Keep the Cloud id until run cleanup: if the tool result write is lost, replay still knows
    // which deterministic asset to return even though the box file has already been deleted.
    return { action: "stop" as const, assetId: asset.id, url: asset.url, durationSeconds };
  }),
});
export const recordingRegistry = { screen_record: screenRecord } satisfies Record<
  string,
  ToolRegistration<RecordingServices>
>;
