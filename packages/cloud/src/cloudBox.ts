/** Persistent per-user compute. Only lifecycle operations hold the user lock. */
import { DaytonaNotFoundError, type Sandbox } from "@daytonaio/sdk";
import { posix } from "node:path";
import * as Context from "effect/Context";
import * as Config from "effect/Config";
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
import { cloudNetworkSettings, type DaytonaNetworkTier } from "./network.ts";
import { AVENIRE_SNAPSHOT, SANDBOX_RESOURCES } from "./snapshot-policy.ts";

export const CLOUD_WORKSPACE = "/home/daytona/workspace";
export const CLOUD_INPUTS = "/home/daytona/.avenire";
export const CLOUD_LIMITS = {
  resources: SANDBOX_RESOURCES,
  idleStopMinutes: 15,
  autoArchiveMinutes: 7 * 24 * 60,
  maxReadBytes: 100 * 1024 * 1024,
} as const;
export interface CloudBox {
  readonly sandbox: Sandbox;
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
  readonly endSession: (sessionId: string) => Effect.Effect<void, CloudError>;
  readonly startDesktop: Effect.Effect<void, CloudError>;
}
export class CloudBoxes extends Context.Service<
  CloudBoxes,
  {
    readonly ensure: (
      userId: string,
      network?: "packages" | "open",
    ) => Effect.Effect<CloudBox, CloudError | SandboxUnavailable>;
    /** Reconnect an existing box by its recorded identity; never creates a replacement. */
    readonly reconnect: (
      userId: string,
      sandboxId: string,
    ) => Effect.Effect<Option.Option<CloudBox>, CloudError>;
    readonly running: (userId: string) => Effect.Effect<Option.Option<CloudBox>, CloudError>;
    readonly stop: (userId: string) => Effect.Effect<void, CloudError>;
    /** Deletes the persistent box and everything in it; the next `ensure` creates a fresh one. */
    readonly destroy: (userId: string) => Effect.Effect<void, CloudError>;
  }
>()("avenire/cloud/CloudBoxes") {}

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
    sandbox,
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
    endSession: Effect.fn("CloudBox.endSession")((sessionId) =>
      attempt("cloudEndSession", () => sandbox.process.deleteSession(sessionId)),
    ),
    startDesktop: attempt("cloudStartDesktop", () => sandbox.computerUse.start()).pipe(
      Effect.asVoid,
    ),
  };
};

export const CloudBoxesLive: Layer.Layer<CloudBoxes, never, DaytonaClient> = Layer.effect(
  CloudBoxes,
  Effect.gen(function* () {
    const daytona = yield* DaytonaClient;
    const networkTier: DaytonaNetworkTier = yield* Config.Literals(
      ["restricted", "open"],
      "DAYTONA_NETWORK_TIER",
    ).pipe(Config.withDefault("restricted" as const), Effect.orDie);
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
    const find = (userId: string, sandboxId?: string) =>
      attempt("findCloudBox", async () => {
        for await (const sandbox of daytona.list({ labels: { app: "ruth-cloud", userId } })) {
          // Legacy per-run desktop boxes use the same app label and must not become the persistent box.
          if (
            (!sandboxId || sandbox.id === sandboxId) &&
            !sandbox.labels.runId &&
            !["destroyed", "destroying"].includes(sandbox.state ?? "")
          )
            return Option.some(sandbox);
        }
        return Option.none<Sandbox>();
      });
    const unavailable = (detail: string) => (error: CloudError) =>
      Effect.fail(new SandboxUnavailable({ detail, cause: error.cause ?? error.detail }));
    return CloudBoxes.of({
      ensure: Effect.fn("CloudBoxes.ensure")((userId, network = "packages") =>
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
                    unavailable("starting the persistent Ava Cloud workspace failed"),
                  ),
                );
            } else {
              const common = {
                ephemeral: false,
                labels: { app: "ruth-cloud", userId },
                autoStopInterval: CLOUD_LIMITS.idleStopMinutes,
                autoArchiveInterval: CLOUD_LIMITS.autoArchiveMinutes,
                // Negative disables auto-delete; zero deletes immediately after stopping.
                autoDeleteInterval: -1,
                ...cloudNetworkSettings(network, networkTier),
              };
              sandbox = yield* attempt("createCloudBox", () =>
                daytona.create({ ...common, snapshot: AVENIRE_SNAPSHOT }),
              ).pipe(
                Effect.catchTag(
                  "CloudError",
                  unavailable("creating the persistent Ava Cloud workspace failed"),
                ),
              );
            }
            yield* attempt("cloudDetachSecrets", () => sandbox.updateSecrets({}));
            if (networkTier === "open")
              yield* attempt("cloudNetworkPolicy", () =>
                sandbox.updateNetworkSettings(cloudNetworkSettings(network, networkTier)),
              );
            else if (network === "open")
              yield* Effect.logWarning(
                "Daytona tier restricts egress; the open network mode is unavailable",
                { userId },
              );
            // Retry directory preparation on reuse if the original create succeeded but preparation failed.
            yield* attempt("createCloudWorkspace", () =>
              sandbox.fs.createFolder(CLOUD_WORKSPACE, "755"),
            ).pipe(
              Effect.catchTag(
                "CloudError",
                unavailable("preparing the Ava Cloud workspace failed"),
              ),
            );
            yield* attempt("createCloudInputs", () =>
              sandbox.fs.createFolder(CLOUD_INPUTS, "755"),
            ).pipe(
              Effect.catchTag("CloudError", unavailable("preparing the Ava Cloud inputs failed")),
            );
            return makeBox(sandbox, userId);
          }).pipe(Effect.uninterruptible),
        ),
      ),
      reconnect: Effect.fn("CloudBoxes.reconnect")((userId, sandboxId) =>
        locked(
          userId,
          Effect.gen(function* () {
            const found = yield* find(userId, sandboxId);
            if (Option.isNone(found) || found.value.id !== sandboxId) return Option.none();
            if (found.value.state !== "started")
              yield* attempt("reconnectCloudBox", () => found.value.start());
            return Option.some(makeBox(found.value, userId));
          }),
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
      destroy: Effect.fn("CloudBoxes.destroy")((userId) =>
        locked(
          userId,
          Effect.gen(function* () {
            const box = yield* find(userId);
            if (Option.isNone(box)) return;
            yield* attempt("destroyCloudBox", () => box.value.delete()).pipe(
              // Already gone is the outcome we wanted.
              Effect.catchTag("CloudError", (error) =>
                missing(error) ? Effect.void : Effect.fail(error),
              ),
            );
          }),
        ),
      ),
    });
  }),
);
