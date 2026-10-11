import { AssetStore, assetRepository, makeAssetStore } from "../outputs/assets.ts";
import { assetSettings } from "../outputs/asset-test-support.ts";
import { describe, expect, it } from "@effect/vitest";
import { CloudRunId, HydrationId, FileId, UserId, type HydrationResult } from "@avenire/contracts";
import { CloudBoxes, type CloudBox } from "@avenire/cloud/cloud-box";
import { CloudError } from "@avenire/cloud/daytona";
import { Database } from "@avenire/database/client";
import { Retrieval } from "@avenire/ingestion/retrieval";
import { SemanticCache } from "@avenire/ingestion/retrieval/cache";
import { RuthToolError } from "../tools/core.ts";
import { RunTokens } from "../cloud/run-tokens.ts";
import { Storage, StorageMemory } from "@avenire/storage/storage";
import { safeValidateUIMessages } from "ai";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { fakeCrypto, recordingDatabase } from "../cloud-test-support.ts";
import { ruthMessageSchemas } from "../message-types.ts";
import {
  cloudUsageSegments,
  makeRuthCloud,
  RUN_WALL_CLOCK,
  type RuthCloudOptions,
} from "./cloud.ts";
import { LOG_TAIL_CHARS, runPaths } from "./cloud-pi.ts";

const runId = CloudRunId.make("run");
const userId = UserId.make("owner");
const manifest: HydrationResult = {
  hydrationId: HydrationId.make("hydration"),
  totalBytes: 5,
  truncated: { byCount: false, byBytes: false },
  files: [
    {
      fileId: FileId.make("source"),
      drivePath: "Physics/Lecture.pdf",
      sandboxPath: "/home/daytona/workspace/inputs/lecture.pdf",
      size: 5,
      hash: "base",
      reason: "edited today",
      skipped: false,
    },
  ],
};
const fixture = (
  options: {
    attempt?: number;
    ensureFailure?: boolean;
    hydrateFailure?: boolean;
    summary?: string | null;
    reportFailure?: boolean;
    logs?: string;
    exitCode?: number | null;
    poll?: (f: ReturnType<typeof recordingDatabase>) => Effect.Effect<{ exitCode: number | null }>;
    start?: Effect.Effect<{ commandId: string }, CloudError>;
  } = {},
) => {
  const events: string[] = [];
  const f = recordingDatabase(events);
  f.rows("user").push({ id: userId, name: "Owner", email: "owner@example.test" });
  f.rows("cloud_run").push({
    id: runId,
    userId,
    taskId: "task",
    folderId: "outputs",
    attempt: options.attempt ?? 1,
    status: "provisioning",
    scheduledFor: new Date(0),
    notBefore: new Date(0),
    createdAt: new Date(0),
    summary: options.summary ?? null,
    reportMessageId: null,
    startedAt: null,
    finishedAt: null,
    sandboxId: null,
    error: null,
  });
  f.rows("cloud_task").push({
    id: "task",
    userId,
    title: "Nightly study digest",
    prompt: "Create notes",
    timeZone: "UTC",
    preHydration: [{ selector: { time: { today: true } } }],
    maxAttempts: 2,
    delivery: { email: true },
  });
  f.rows("file").push({
    id: "notes",
    userId,
    title: "Study notes",
    source: "ruth-cloud",
    createdAt: new Date(0),
  });
  f.rows("file_folder").push({ fileId: "notes", userId, folderId: "outputs" });
  f.rows("pending_approval").push({
    id: "approval",
    runId,
    userId,
    fileId: "notes",
    summary: "Updated notes",
    conflict: "Original changed",
    status: "conflict",
  });
  const files = new Map<string, string>();
  const commands: { sessionId: string; command: string; cwd?: string }[] = [];
  const mintInputs: unknown[] = [];
  const event = (name: string) =>
    Effect.sync(() => {
      events.push(name);
    });
  const box: CloudBox = {
    id: "sandbox",
    userId,
    exec: () => event("prepare-output").pipe(Effect.as({ exitCode: 0, output: "" })),
    writeFile: (path, bytes) =>
      Effect.sync(() => {
        events.push(`write:${path}`);
        files.set(path, new TextDecoder().decode(bytes));
      }),
    readFile: () => Effect.die("unused"),
    fileInfo: () => Effect.succeed(Option.none()),
    removeFile: () => Effect.void,
    startCommand: (command) =>
      Effect.gen(function* () {
        events.push("command-started");
        commands.push(command);
        f.rows("cloud_run")[0]!.summary = options.summary ?? "Published study notes.";
        if (options.summary === null) f.rows("cloud_run")[0]!.summary = null;
        if (options.reportFailure) f.rows("cloud_run")[0]!.error = "The agent reported failure.";
        return yield* options.start ?? Effect.succeed({ commandId: "command" });
      }),
    commandStatus: () =>
      event("poll").pipe(
        Effect.andThen(
          options.poll
            ? options.poll(f)
            : Effect.succeed({ exitCode: options.exitCode === undefined ? 0 : options.exitCode }),
        ),
      ),
    commandLogs: () =>
      event("logs").pipe(
        Effect.as(
          options.logs ??
            '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}\n',
        ),
      ),
    endSession: () => event("session-ended"),
    startDesktop: event("desktop-started"),
    startRecording: () => event("recording-started").pipe(Effect.as(Option.some("recording"))),
    stopRecording: () =>
      event("recording-stopped").pipe(Effect.as(Option.some(new Uint8Array([1, 2])))),
  };
  const boxes = CloudBoxes.of({
    ensure: () =>
      event("box-ensured").pipe(
        Effect.andThen(
          options.ensureFailure
            ? Effect.fail(new CloudError({ operation: "create", detail: "box creation failed" }))
            : Effect.succeed(box),
        ),
      ),
    running: () => Effect.succeed(Option.some(box)),
    stop: () => event("box-stopped"),
    setRunToken: () => event("secret-set"),
    clearRunToken: () => event("secret-cleared"),
  });
  const tokens = RunTokens.of({
    mint: (input) =>
      Effect.sync(() => {
        events.push("token-minted");
        mintInputs.push(input);
        return { token: "fake-private-token", tokenId: "token" };
      }),
    revokeRun: () => event("token-revoked"),
    verify: () => Effect.die("unused"),
  });
  const services = Context.make(Database, f.database).pipe(
    Context.add(CloudBoxes, boxes),
    Context.add(RunTokens, tokens),
    Context.add(Crypto.Crypto, fakeCrypto),
    Context.add(Retrieval, Retrieval.of({ search: () => Effect.die("unused") })),
    Context.add(
      SemanticCache,
      SemanticCache.of({
        lookupExact: () => Effect.succeed(Option.none()),
        lookupSimilar: () => Effect.succeed(Option.none()),
        store: () => Effect.void,
        invalidate: () => Effect.void,
      }),
    ),
  );
  const config: RuthCloudOptions = {
    extensionSource: "// extension",
    apiBaseUrl: "https://gateway.example.test",
    appUrl: "https://app.example.test",
    model: "claude-opus-5-5",
    hydrate: () =>
      Effect.gen(function* () {
        events.push("pre-hydration");
        if (options.hydrateFailure)
          return yield* new RuthToolError({
            tool: "hydrate_files",
            code: "failed",
            message: "Input unavailable",
            recoverable: true,
          });
        f.rows("cloud_hydration").push({
          id: "hydration",
          userId,
          runId,
          files: manifest.files,
          createdAt: new Date(0),
        });
        return { ...manifest, files: [...manifest.files] };
      }),
  };
  return { ...f, events, services, config, files, commands, mintInputs };
};
const run = (f: ReturnType<typeof fixture>) =>
  Effect.gen(function* () {
    const storage = yield* Storage;
    const services = f.services.pipe(
      Context.add(Storage, {
        ...storage,
        put: (key, bytes, options) =>
          Effect.sync(() => {
            f.events.push("recording-stored");
          }).pipe(Effect.andThen(storage.put(key, bytes, options))),
      }),
    );
    const assets = yield* makeAssetStore({
      ...assetSettings,
      repository: assetRepository(f.database),
    }).pipe(Effect.provideContext(services));
    const cloud = yield* makeRuthCloud(f.config).pipe(
      Effect.provideContext(Context.add(services, AssetStore, assets)),
    );
    yield* cloud.execute(runId);
  }).pipe(Effect.provide(StorageMemory));
const validate = (message: unknown) =>
  Effect.promise(() => safeValidateUIMessages({ messages: [message], ...ruthMessageSchemas }));

describe("RuthCloud Pi orchestrator", () => {
  it.effect("runs in order, posts a valid report and always cleans up", () => {
    const f = fixture();
    return Effect.gen(function* () {
      yield* run(f);
      const sequence = [
        "token-minted",
        "secret-set",
        "box-ensured",
        "write:/home/daytona/workspace/.avenire/run.json",
        "pre-hydration",
        "command-started",
        "poll",
        "report-posted",
        "token-revoked",
        "secret-cleared",
        "box-stopped",
      ];
      const positions = sequence.map((name) => f.events.indexOf(name));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(f.rows("cloud_run")[0]).toMatchObject({
        status: "succeeded",
        sandboxId: "sandbox",
        summary: "Published study notes.",
        finishedAt: new Date(0),
      });
      expect(f.rows("asset")[0]).toMatchObject({ kind: "video", runId });
      expect(f.rows("email_outbox")[0]).toMatchObject({
        template: "morning-digest",
        props: {
          filesRead: 1,
          pendingApprovals: 1,
          produced: [{ title: "Study notes", url: "https://app.example.test/library?file=notes" }],
        },
      });
      expect((yield* validate(f.rows("ruth_message")[0])).success).toBe(true);
      expect(f.commands[0]).toMatchObject({ sessionId: runId, cwd: runPaths(runId).runDir });
      expect(f.files.get(runPaths(runId).prompt)).toContain("Physics/Lecture.pdf");
      expect([...f.files.values()].join(" ")).not.toContain("fake-private-token");
      expect(f.mintInputs[0]).toMatchObject({
        scopes: ["retrieval", "download", "hydrate", "publish"],
      });
    });
  });
  it.effect(
    "box creation on attempt one schedules a five-minute retry without a report/email",
    () => {
      const f = fixture({ ensureFailure: true });
      return Effect.gen(function* () {
        expect(Exit.isFailure(yield* Effect.exit(run(f)))).toBe(true);
        expect(f.rows("cloud_run")).toHaveLength(2);
        expect(f.rows("cloud_run")[0]).toMatchObject({
          status: "failed",
          error: expect.stringContaining("Retrying: "),
        });
        expect(f.rows("cloud_run")[1]).toMatchObject({
          attempt: 2,
          status: "scheduled",
          scheduledFor: new Date(0),
          notBefore: new Date(300_000),
        });
        expect(f.rows("email_outbox")).toHaveLength(0);
        expect(f.rows("ruth_message")).toHaveLength(0);
        expect(f.events).toContain("token-revoked");
        expect(f.events).toContain("secret-cleared");
      });
    },
  );
  it.effect("final-attempt failure posts a valid report and failure email", () => {
    const f = fixture({ ensureFailure: true, attempt: 2 });
    return Effect.gen(function* () {
      yield* Effect.exit(run(f));
      expect(f.rows("cloud_run")).toHaveLength(1);
      expect(f.rows("cloud_run")[0]?.status).toBe("failed");
      expect(f.rows("email_outbox")[0]).toMatchObject({
        template: "cloud-run-failed",
        props: { taskTitle: "Nightly study digest" },
      });
      expect((yield* validate(f.rows("ruth_message")[0])).success).toBe(true);
    });
  });
  it.effect("pre-hydration failures are reported without stopping Pi", () => {
    const f = fixture({ hydrateFailure: true });
    return Effect.gen(function* () {
      yield* run(f);
      expect(f.rows("cloud_run")[0]?.status).toBe("succeeded");
      expect(JSON.stringify(f.rows("ruth_message")[0])).toContain("Input unavailable");
    });
  });
  it.effect("wall-clock timeout terminates the session and does not retry a started agent", () =>
    Effect.gen(function* () {
      const polling = yield* Deferred.make<void>();
      const f = fixture({
        exitCode: null,
        poll: () => Deferred.succeed(polling, undefined).pipe(Effect.as({ exitCode: null })),
      });
      const fiber = yield* Effect.forkChild(run(f));
      yield* Deferred.await(polling);
      yield* TestClock.adjust(RUN_WALL_CLOCK);
      expect(Exit.isFailure(yield* Fiber.await(fiber))).toBe(true);
      expect(f.rows("cloud_run")).toHaveLength(1);
      expect(f.rows("cloud_run")[0]).toMatchObject({
        status: "failed",
        error: expect.stringContaining("wall-clock"),
      });
      expect(f.events).toContain("session-ended");
      expect(f.events).toContain("token-revoked");
      expect(f.events).toContain("secret-cleared");
    }),
  );
  it.effect(
    "cancellation terminates the session, reports cancellation and sends no failure email",
    () => {
      const f = fixture({
        poll: (db) =>
          Effect.sync(() => {
            db.rows("cloud_run")[0]!.status = "cancelled";
            return { exitCode: 0 };
          }),
      });
      return Effect.gen(function* () {
        yield* run(f);
        expect(f.rows("cloud_run")[0]?.status).toBe("cancelled");
        expect(f.rows("email_outbox")).toHaveLength(0);
        expect(f.events).toContain("session-ended");
        expect(f.events).toContain("secret-cleared");
      });
    },
  );
  it.effect("interruption waits for token/secret/session cleanup", () =>
    Effect.gen(function* () {
      const polling = yield* Deferred.make<void>();
      const f = fixture({
        poll: () => Deferred.succeed(polling, undefined).pipe(Effect.andThen(Effect.never)),
      });
      const fiber = yield* Effect.forkChild(run(f));
      yield* Deferred.await(polling);
      yield* Fiber.interrupt(fiber);
      expect(f.rows("cloud_run")[0]?.status).toBe("cancelled");
      expect(f.events).toContain("token-revoked");
      expect(f.events).toContain("secret-cleared");
      expect(f.events).toContain("session-ended");
      expect(f.events).toContain("box-stopped");
    }),
  );
  it.effect("interruption during command acquisition waits for its session before cleanup", () =>
    Effect.gen(function* () {
      const acquiring = yield* Deferred.make<void>();
      const acquired = yield* Deferred.make<void>();
      const f = fixture({
        start: Deferred.succeed(acquiring, undefined).pipe(
          Effect.andThen(Deferred.await(acquired)),
          Effect.as({ commandId: "command" }),
        ),
      });
      const fiber = yield* Effect.forkChild(run(f));
      yield* Deferred.await(acquiring);
      const stopping = yield* Effect.forkChild(Fiber.interrupt(fiber));
      yield* Effect.yieldNow;
      expect(f.events).not.toContain("session-ended");
      yield* Deferred.succeed(acquired, undefined);
      yield* Fiber.join(stopping);
      expect(f.rows("cloud_run")[0]?.status).toBe("cancelled");
      expect(f.events).toContain("session-ended");
      expect(f.events).toContain("token-revoked");
      expect(f.events).toContain("secret-cleared");
      expect(f.events).toContain("box-stopped");
    }),
  );
  it.effect("Pi crashes after starting are agent failures, with cleanup but no retry", () => {
    const f = fixture({ summary: null, exitCode: 1 });
    return Effect.gen(function* () {
      yield* Effect.exit(run(f));
      expect(f.rows("cloud_run")).toHaveLength(1);
      expect(f.rows("cloud_run")[0]?.status).toBe("failed");
      expect(f.rows("email_outbox")[0]?.template).toBe("cloud-run-failed");
      expect(f.events).toContain("token-revoked");
      expect(f.events).toContain("secret-cleared");
    });
  });
  it.effect("failure to start Pi retries; agent-reported failure does not", () => {
    const start = fixture({
      start: Effect.fail(
        new CloudError({ operation: "startCommand", detail: "session start failed" }),
      ),
    });
    const reported = fixture({ reportFailure: true });
    return Effect.gen(function* () {
      yield* Effect.exit(run(start));
      expect(start.rows("cloud_run")).toHaveLength(2);
      expect(start.rows("email_outbox")).toHaveLength(0);
      yield* Effect.exit(run(reported));
      expect(reported.rows("cloud_run")).toHaveLength(1);
      expect(reported.rows("cloud_run")[0]?.status).toBe("failed");
    });
  });
  it.effect("fallback assistant summary and bounded log tail redact the bearer token", () => {
    const f = fixture({
      summary: null,
      logs:
        `diagnostic ${"x".repeat(10_000)}\n` +
        JSON.stringify({
          type: "agent_end",
          messages: [
            { role: "assistant", content: [{ type: "text", text: "Finished fake-private-token" }] },
          ],
        }),
    });
    return Effect.gen(function* () {
      yield* run(f);
      expect(f.rows("cloud_run")[0]?.summary).toBe("Finished [redacted]");
      expect(String(f.rows("cloud_run")[0]?.logTail)).toHaveLength(LOG_TAIL_CHARS);
      expect(JSON.stringify(f.writes)).not.toContain("fake-private-token");
    });
  });
  it.effect("another claimed run leaves the shared box to idle-stop", () => {
    const f = fixture();
    f.rows("cloud_run").push({ id: "other", userId, taskId: "task", status: "provisioning" });
    return Effect.gen(function* () {
      yield* run(f);
      expect(f.events).not.toContain("box-stopped");
    });
  });
});

it("splits cloud seconds across UTC days", () => {
  expect(
    cloudUsageSegments(Date.parse("2026-10-09T23:59:30Z"), Date.parse("2026-10-10T00:01:00Z")),
  ).toEqual([
    { day: "2026-10-09", seconds: 30 },
    { day: "2026-10-10", seconds: 60 },
  ]);
});
