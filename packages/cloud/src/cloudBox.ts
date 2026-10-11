/** Persistent per-user compute. Only lifecycle operations hold the user lock. */
import { DaytonaConflictError, DaytonaNotFoundError, type Sandbox } from "@daytonaio/sdk";
import { randomBytes } from "node:crypto";
import { isIPv4 } from "node:net";
import { posix } from "node:path";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import { SandboxUnavailable } from "./chatSandbox.ts";
import {
  attempt,
  CloudError,
  DaytonaClient,
  SandboxInputRejected,
  SandboxTimeout,
} from "./daytona.ts";
import { AVENIRE_SNAPSHOT, SANDBOX_RESOURCES } from "./snapshots.ts";

export const CLOUD_WORKSPACE = "/home/daytona/workspace";
export const CLOUD_INPUTS = `${CLOUD_WORKSPACE}/inputs`;
export const CLOUD_LIMITS = {
  resources: SANDBOX_RESOURCES,
  idleStopMinutes: 15,
  autoArchiveMinutes: 7 * 24 * 60,
  maxReadBytes: 100 * 1024 * 1024,
} as const;
export interface CloudBox {
  readonly id: string;
  readonly userId: string;
  readonly exec: (
    command: string,
    options?: { cwd?: string; timeoutSeconds?: number },
  ) => Effect.Effect<{ exitCode: number; output: string }, CloudError | SandboxTimeout>;
  readonly writeFile: (path: string, bytes: Uint8Array) => Effect.Effect<void, CloudError>;
  readonly readFile: (path: string) => Effect.Effect<Uint8Array, CloudError | SandboxInputRejected>;
  readonly fileInfo: (
    path: string,
  ) => Effect.Effect<Option.Option<{ size: number; isDir: boolean }>, CloudError>;
  readonly removeFile: (path: string) => Effect.Effect<void, CloudError>;
  readonly startCommand: (input: {
    sessionId: string;
    command: string;
    cwd?: string;
  }) => Effect.Effect<{ commandId: string }, CloudError>;
  readonly commandStatus: (
    sessionId: string,
    commandId: string,
  ) => Effect.Effect<{ exitCode: number | null }, CloudError>;
  readonly commandLogs: (
    sessionId: string,
    commandId: string,
    maxChars: number,
  ) => Effect.Effect<string, CloudError>;
  readonly endSession: (sessionId: string) => Effect.Effect<void, CloudError>;
  readonly startDesktop: Effect.Effect<void, CloudError>;
  readonly startRecording: (name: string) => Effect.Effect<Option.Option<string>, CloudError>;
  readonly stopRecording: (id: string) => Effect.Effect<Option.Option<Uint8Array>, CloudError>;
}
export class CloudBoxes extends Context.Service<
  CloudBoxes,
  {
    readonly ensure: (userId: string) => Effect.Effect<CloudBox, CloudError | SandboxUnavailable>;
    readonly running: (userId: string) => Effect.Effect<Option.Option<CloudBox>, CloudError>;
    readonly stop: (userId: string) => Effect.Effect<void, CloudError>;
    readonly setRunToken: (userId: string, token: string) => Effect.Effect<void, CloudError>;
    readonly clearRunToken: (userId: string) => Effect.Effect<void, CloudError>;
  }
>()("avenire/cloud/CloudBoxes") {}

export const tokenSecretName = (userId: string) =>
  `ruth-cloud-token-${userId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const missing = (error: CloudError) => error.cause instanceof DaytonaNotFoundError;
const makeBox = (sandbox: Sandbox, userId: string): CloudBox => {
  const fileInfo: CloudBox["fileInfo"] = Effect.fn("CloudBox.fileInfo")((path) =>
    attempt("cloudFileInfo", () => sandbox.fs.getFileDetails(path)).pipe(
      Effect.map(({ size, isDir }) => Option.some({ size, isDir })),
      Effect.catchTag("CloudError", (error) =>
        missing(error) ? Effect.succeed(Option.none()) : Effect.fail(error),
      ),
    ),
  );
  return {
    id: sandbox.id,
    userId,
    exec: Effect.fn("CloudBox.exec")((command, options = {}) => {
      const timeout = options.timeoutSeconds ?? 120;
      if (!Number.isInteger(timeout) || timeout < 1)
        return Effect.fail(
          new CloudError({
            operation: "cloudExec",
            detail: "Timeout must be a positive integer number of seconds",
          }),
        );
      return attempt("cloudExec", () =>
        sandbox.process.executeCommand(command, options.cwd ?? CLOUD_WORKSPACE, undefined, timeout),
      ).pipe(
        Effect.timeoutOrElse({
          duration: `${timeout + 30} seconds`,
          orElse: () =>
            Effect.fail(new SandboxTimeout({ operation: "exec", timeoutSeconds: timeout })),
        }),
        Effect.map(({ exitCode, result }) => ({ exitCode, output: result })),
      );
    }),
    writeFile: Effect.fn("CloudBox.writeFile")(function* (path, bytes) {
      yield* attempt("cloudCreateParent", () =>
        sandbox.fs.createFolder(posix.dirname(path), "755"),
      );
      yield* attempt("cloudWriteFile", () => sandbox.fs.uploadFile(Buffer.from(bytes), path));
    }),
    fileInfo,
    readFile: Effect.fn("CloudBox.readFile")(function* (path) {
      const info = yield* fileInfo(path);
      if (Option.isNone(info) || info.value.isDir || info.value.size > CLOUD_LIMITS.maxReadBytes)
        return yield* new SandboxInputRejected({
          reason: "Read a regular file no larger than 100 MB.",
        });
      const bytes = yield* attempt("cloudReadFile", () => sandbox.fs.downloadFile(path));
      // A command can grow a file between stat and download; never return oversized bytes.
      if (bytes.length > CLOUD_LIMITS.maxReadBytes)
        return yield* new SandboxInputRejected({
          reason: "The file grew beyond the 100 MB read limit.",
        });
      return new Uint8Array(bytes);
    }),
    removeFile: Effect.fn("CloudBox.removeFile")((path) =>
      attempt("cloudRemoveFile", () => sandbox.fs.deleteFile(path)),
    ),
    startCommand: Effect.fn("CloudBox.startCommand")(function* ({ sessionId, command, cwd }) {
      yield* attempt("cloudCreateSession", () => sandbox.process.createSession(sessionId));
      const response = yield* attempt("cloudStartCommand", () =>
        sandbox.process.executeSessionCommand(sessionId, {
          command: `cd ${shellQuote(cwd ?? CLOUD_WORKSPACE)} && ${command}`,
          runAsync: true,
        }),
      );
      if (!response.cmdId)
        return yield* new CloudError({
          operation: "cloudStartCommand",
          detail: "No command id returned",
        });
      return { commandId: response.cmdId };
    }),
    commandStatus: Effect.fn("CloudBox.commandStatus")((sessionId, commandId) =>
      attempt("cloudCommandStatus", () =>
        sandbox.process.getSessionCommand(sessionId, commandId),
      ).pipe(Effect.map((command) => ({ exitCode: command.exitCode ?? null }))),
    ),
    commandLogs: Effect.fn("CloudBox.commandLogs")((sessionId, commandId, maxChars) =>
      attempt("cloudCommandLogs", () =>
        sandbox.process.getSessionCommandLogs(sessionId, commandId),
      ).pipe(
        Effect.map((logs) => {
          const text = logs.output ?? `${logs.stdout ?? ""}${logs.stderr ?? ""}`;
          const max = Math.max(0, Math.floor(maxChars));
          return max === 0 ? "" : text.slice(-max);
        }),
      ),
    ),
    endSession: Effect.fn("CloudBox.endSession")((sessionId) =>
      attempt("cloudEndSession", () => sandbox.process.deleteSession(sessionId)),
    ),
    startDesktop: attempt("cloudStartDesktop", () => sandbox.computerUse.start()).pipe(
      Effect.asVoid,
    ),
    startRecording: Effect.fn("CloudBox.startRecording")((name) =>
      sandbox.computerUse?.recording === undefined
        ? Effect.succeed(Option.none())
        : attempt("cloudStartRecording", () => sandbox.computerUse.recording.start(name)).pipe(
            Effect.map((recording) => Option.some(recording.id)),
            Effect.catchTag("CloudError", (error) =>
              missing(error) ? Effect.succeed(Option.none()) : Effect.fail(error),
            ),
          ),
    ),
    stopRecording: Effect.fn("CloudBox.stopRecording")((id) =>
      sandbox.computerUse?.recording === undefined
        ? Effect.succeed(Option.none())
        : attempt("cloudStopRecording", () => sandbox.computerUse.recording.stop(id)).pipe(
            Effect.flatMap((recording) =>
              attempt("cloudReadRecording", () => sandbox.fs.downloadFile(recording.filePath)),
            ),
            Effect.map((bytes) => Option.some(new Uint8Array(bytes))),
          ),
    ),
  };
};

export const CloudBoxesLive: Layer.Layer<CloudBoxes, never, DaytonaClient> = Layer.effect(
  CloudBoxes,
  Effect.gen(function* () {
    const daytona = yield* DaytonaClient;
    const config = yield* Config.all({
      modelSecret: Config.String("RUTH_CLOUD_MODEL_SECRET").pipe(
        Config.withDefault("ruth-cloud-model-key"),
      ),
      apiBaseUrl: Config.String("RUTH_CLOUD_API_BASE_URL"),
      egress: Config.String("RUTH_CLOUD_EGRESS_CIDRS"),
    }).pipe(Effect.orDie);
    const host = yield* Effect.try({
      try: () => new URL(config.apiBaseUrl).hostname,
      catch: (cause) => new CloudError({ operation: "cloudConfig", cause }),
    }).pipe(Effect.orDie);
    const cidrs = config.egress.split(",").map((entry) => entry.trim());
    if (
      !host ||
      cidrs.length > 10 ||
      cidrs.some((entry) => {
        const [ip, prefix, extra] = entry.split("/");
        return (
          !ip ||
          !isIPv4(ip) ||
          prefix === undefined ||
          !/^\d+$/.test(prefix) ||
          Number(prefix) > 32 ||
          extra !== undefined
        );
      })
    )
      return yield* Effect.die(
        new CloudError({
          operation: "cloudConfig",
          detail: "Configure an API URL and 1–10 IPv4 CIDRs for Ruth Cloud egress.",
        }),
      );
    const locks = new Map<string, Semaphore.Semaphore>();
    const locked = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
      Effect.suspend(() => {
        let lock = locks.get(userId);
        if (!lock) {
          lock = Semaphore.makeUnsafe(1);
          locks.set(userId, lock);
        }
        return effect.pipe(lock.withPermits(1));
      });
    const find = (userId: string) =>
      attempt("findCloudBox", async () => {
        for await (const sandbox of daytona.list({ labels: { app: "ruth-cloud", userId } })) {
          // Legacy per-run desktop boxes use the same app label and must not become the persistent box.
          if (!sandbox.labels.runId && !["destroyed", "destroying"].includes(sandbox.state ?? ""))
            return Option.some(sandbox);
        }
        return Option.none<Sandbox>();
      });
    const findSecret = (name: string) =>
      attempt("findCloudTokenSecret", async () => {
        let cursor: string | undefined;
        do {
          // eslint-disable-next-line no-await-in-loop -- Each page depends on the cursor returned by the previous page.
          const page = await daytona.secret.list({
            name,
            limit: 200,
            ...(cursor ? { cursor } : {}),
          });
          const secret = page.items.find((entry) => entry.name === name);
          if (secret) return Option.some(secret);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return Option.none<Awaited<ReturnType<typeof daytona.secret.create>>>();
      });
    const deadToken = () => Effect.sync(() => randomBytes(32).toString("base64url"));
    const ensureSecret = Effect.fn("CloudBoxes.ensureSecret")(function* (userId: string) {
      const name = tokenSecretName(userId);
      const found = yield* findSecret(name);
      if (Option.isSome(found)) return found.value;
      const value = yield* deadToken();
      return yield* attempt("createCloudTokenSecret", () =>
        daytona.secret.create({ name, value, hosts: [host] }),
      ).pipe(
        // Another server instance can create the same secret concurrently.
        Effect.catchTag("CloudError", (error) =>
          error.cause instanceof DaytonaConflictError
            ? findSecret(name).pipe(
                Effect.flatMap((existing) =>
                  Option.isSome(existing) ? Effect.succeed(existing.value) : Effect.fail(error),
                ),
              )
            : Effect.fail(error),
        ),
      );
    });
    const rotate = Effect.fn("CloudBoxes.rotateToken")(function* (userId: string, value: string) {
      const secret = yield* ensureSecret(userId);
      yield* attempt("updateCloudTokenSecret", () =>
        daytona.secret.update(secret.id, { value, hosts: [host] }),
      );
    });
    const unavailable = (detail: string) => (error: CloudError) =>
      Effect.fail(new SandboxUnavailable({ detail, cause: error.cause ?? error.detail }));
    return CloudBoxes.of({
      ensure: Effect.fn("CloudBoxes.ensure")((userId) =>
        locked(
          userId,
          Effect.gen(function* () {
            const existing = yield* find(userId);
            let sandbox: Sandbox;
            if (Option.isSome(existing)) {
              sandbox = existing.value;
              if (sandbox.state !== "started")
                yield* attempt("startCloudBox", () => sandbox.start()).pipe(
                  Effect.catchTag(
                    "CloudError",
                    unavailable("starting the persistent Ruth Cloud workspace failed"),
                  ),
                );
            } else {
              yield* ensureSecret(userId);
              const common = {
                ephemeral: false,
                labels: { app: "ruth-cloud", userId },
                autoStopInterval: CLOUD_LIMITS.idleStopMinutes,
                autoArchiveInterval: CLOUD_LIMITS.autoArchiveMinutes,
                // Negative disables auto-delete; zero deletes immediately after stopping.
                autoDeleteInterval: -1,
                networkAllowList: cidrs.join(","),
                secrets: {
                  ANTHROPIC_API_KEY: config.modelSecret,
                  AVENIRE_RUN_TOKEN: tokenSecretName(userId),
                },
              };
              sandbox = yield* attempt("createCloudBox", () =>
                daytona.create({ ...common, snapshot: AVENIRE_SNAPSHOT }),
              ).pipe(
                Effect.catchTag(
                  "CloudError",
                  unavailable("creating the persistent Ruth Cloud workspace failed"),
                ),
              );
            }
            // Retry directory preparation on reuse if the original create succeeded but preparation failed.
            yield* attempt("createCloudWorkspace", () =>
              sandbox.fs.createFolder(CLOUD_WORKSPACE, "755"),
            ).pipe(
              Effect.catchTag(
                "CloudError",
                unavailable("preparing the Ruth Cloud workspace failed"),
              ),
            );
            yield* attempt("createCloudInputs", () =>
              sandbox.fs.createFolder(CLOUD_INPUTS, "755"),
            ).pipe(
              Effect.catchTag("CloudError", unavailable("preparing the Ruth Cloud inputs failed")),
            );
            return makeBox(sandbox, userId);
          }).pipe(Effect.uninterruptible),
        ),
      ),
      running: Effect.fn("CloudBoxes.running")((userId) =>
        find(userId).pipe(
          Effect.map((box) =>
            Option.isSome(box) && box.value.state === "started"
              ? Option.some(makeBox(box.value, userId))
              : Option.none(),
          ),
        ),
      ),
      stop: Effect.fn("CloudBoxes.stop")((userId) =>
        locked(
          userId,
          Effect.gen(function* () {
            const box = yield* find(userId);
            if (Option.isSome(box) && box.value.state === "started")
              yield* attempt("stopCloudBox", () => box.value.stop());
          }),
        ),
      ),
      setRunToken: Effect.fn("CloudBoxes.setRunToken")((userId, token) =>
        locked(userId, rotate(userId, token)),
      ),
      clearRunToken: Effect.fn("CloudBoxes.clearRunToken")((userId) =>
        locked(userId, deadToken().pipe(Effect.flatMap((value) => rotate(userId, value)))),
      ),
    });
  }),
);
