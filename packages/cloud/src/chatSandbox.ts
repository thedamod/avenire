/** Per-thread ephemeral compute. Packages belong in the snapshot: egress is blocked by default. */
import type { Sandbox } from "@daytonaio/sdk";
import { DaytonaNotFoundError } from "@daytonaio/sdk";
import { posix } from "node:path";
import * as Clock from "effect/Clock";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { attempt, CloudError, DaytonaClient, SandboxTimeout } from "./daytona.ts";
import { SandboxInputRejected } from "./sandbox.ts";

export interface SandboxOwner {
  readonly userId: string;
  readonly threadId: string;
}
export class SandboxQuotaExceeded extends Schema.TaggedError<SandboxQuotaExceeded>()(
  "SandboxQuotaExceeded",
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}
export class SandboxUnavailable extends Schema.TaggedError<SandboxUnavailable>()(
  "SandboxUnavailable",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `The sandbox could not start (${this.detail}). Try again in a moment, or answer without running code.`;
  }
}
/** Usage metering is implemented over the database elsewhere; cloud stays DB-free. */
export class SandboxMeter extends Context.Service<
  SandboxMeter,
  {
    readonly ensureAllowance: (userId: string) => Effect.Effect<void, SandboxQuotaExceeded>;
    readonly record: (userId: string, seconds: number) => Effect.Effect<void>;
  }
>()("avenire/cloud/SandboxMeter") {}
export const SandboxMeterUnlimited: Layer.Layer<SandboxMeter> = Layer.succeed(
  SandboxMeter,
  SandboxMeter.of({
    ensureAllowance: () => Effect.void,
    record: () => Effect.void,
  }),
);
export const CHAT_SANDBOX_LIMITS = {
  commandTimeoutSeconds: 120,
  maxCommandTimeoutSeconds: 900,
  maxOutputBytes: 64 * 1024,
  maxReadBytes: 1024 * 1024,
  maxArtifactBytes: 50 * 1024 * 1024,
  maxWriteBytes: 10 * 1024 * 1024,
  lifetimeMinutes: 60,
  idleStopMinutes: 15,
  maxPerUser: 3,
  resources: { cpu: 2, memory: 4, disk: 5 },
} as const;
export const CHAT_WORKDIR = "/home/daytona/work";
export type ChatSandboxError =
  | CloudError
  | SandboxTimeout
  | SandboxInputRejected
  | SandboxQuotaExceeded
  | SandboxUnavailable;
export class ChatSandboxes extends Context.Service<
  ChatSandboxes,
  {
    readonly exec: (
      owner: SandboxOwner,
      input: { command: string; cwd?: string; timeoutSeconds?: number },
    ) => Effect.Effect<
      { exitCode: number; output: string; truncated: boolean; durationMs: number },
      ChatSandboxError
    >;
    readonly write: (
      owner: SandboxOwner,
      input: { path: string; bytes: Uint8Array },
    ) => Effect.Effect<{ path: string; size: number }, ChatSandboxError>;
    readonly read: (
      owner: SandboxOwner,
      input: { path: string; maxBytes?: number },
    ) => Effect.Effect<
      { path: string; bytes: Uint8Array; size: number; truncated: boolean },
      ChatSandboxError
    >;
    /** Downloads a whole file up to maxArtifactBytes. */
    readonly readArtifact: (
      owner: SandboxOwner,
      input: { path: string },
    ) => Effect.Effect<{ path: string; name: string; bytes: Uint8Array }, ChatSandboxError>;
    readonly close: (
      owner: SandboxOwner,
    ) => Effect.Effect<{ closed: boolean; lifetimeSeconds: number }, CloudError>;
    readonly sweep: Effect.Effect<number, CloudError>;
  }
>()("avenire/cloud/ChatSandboxes") {}

type Entry = {
  readonly sandbox: Sandbox;
  readonly createdAtMs: number;
  readonly owner: SandboxOwner;
};
const key = (owner: SandboxOwner) => JSON.stringify([owner.userId, owner.threadId]);
const labels = (owner: SandboxOwner) => ({
  app: "ruth-chat",
  userId: owner.userId,
  threadId: owner.threadId,
});
const reject = (reason: string) => Effect.fail(new SandboxInputRejected({ reason }));
const resolvePath = (path: string) => {
  const resolved = posix.resolve(CHAT_WORKDIR, path);
  return !path.includes("\0") &&
    ["/home/daytona", "/tmp"].some((root) => resolved === root || resolved.startsWith(`${root}/`))
    ? Effect.succeed(resolved)
    : reject("Paths must stay under /home/daytona or /tmp and contain no NUL bytes");
};
const createdAt = (sandbox: Sandbox, fallback: number) => {
  const label = sandbox.labels.createdAt;
  const labeledMs = label?.trim() ? Number(label) : NaN;
  const sdkMs = Date.parse(sandbox.createdAt ?? "");
  if (Number.isFinite(labeledMs) && labeledMs >= 0) return labeledMs;
  return Number.isFinite(sdkMs) && sdkMs >= 0 ? sdkMs : fallback;
};
const live = (sandbox: Sandbox) => sandbox.state !== "destroyed" && sandbox.state !== "destroying";
const lifetimeTimeout = () =>
  new SandboxTimeout({
    operation: "lifetime",
    timeoutSeconds: CHAT_SANDBOX_LIMITS.lifetimeMinutes * 60,
  });

export const ChatSandboxesLive: Layer.Layer<ChatSandboxes, never, DaytonaClient | SandboxMeter> =
  Layer.effect(
    ChatSandboxes,
    Effect.gen(function* () {
      const daytona = yield* DaytonaClient;
      const meter = yield* SandboxMeter;
      const snapshot = yield* Config.option(Config.String("DAYTONA_CHAT_SNAPSHOT")).pipe(
        Effect.orDie,
      );
      const allowList = yield* Config.option(Config.String("CHAT_SANDBOX_NETWORK_ALLOW_LIST")).pipe(
        Effect.orDie,
      );
      const registry = new Map<string, Entry>();
      const deletedIds = new Set<string>();
      const locks = new Map<string, Semaphore.Semaphore>();
      // Serializing each user's lifecycle also makes count + create atomic within this instance.
      const locked = <A, E, R>(userId: string, effect: Effect.Effect<A, E, R>) =>
        Effect.suspend(() => {
          let lock = locks.get(userId);
          if (lock === undefined) {
            lock = Semaphore.makeUnsafe(1);
            locks.set(userId, lock);
          }
          return effect.pipe(lock.withPermits(1));
        });
      const list = (queryLabels: Record<string, string>) =>
        attempt("listChatSandboxes", async () => {
          const sandboxes: Sandbox[] = [];
          for await (const sandbox of daytona.list({ labels: queryLabels }))
            if (live(sandbox) && !deletedIds.has(sandbox.id)) sandboxes.push(sandbox);
          return sandboxes;
        });
      const entryFor = (sandbox: Sandbox, owner: SandboxOwner, now: number): Entry => ({
        sandbox,
        owner,
        createdAtMs: createdAt(sandbox, now),
      });
      const remove = Effect.fn("ChatSandboxes.delete")(function* (entry: Entry) {
        if (deletedIds.has(entry.sandbox.id)) return { closed: false, lifetimeSeconds: 0 };
        const seconds = Math.max(0, ((yield* Clock.currentTimeMillis) - entry.createdAtMs) / 1000);
        const deleted = yield* attempt("deleteChatSandbox", () => entry.sandbox.delete()).pipe(
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logWarning("Failed to delete chat sandbox", cause).pipe(Effect.as(false)),
          ),
        );
        if (deleted) {
          deletedIds.add(entry.sandbox.id);
          for (const [id, cached] of registry)
            if (cached.sandbox.id === entry.sandbox.id) registry.delete(id);
          yield* meter
            .record(entry.owner.userId, seconds)
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to record chat sandbox usage", cause),
              ),
            );
        }
        return { closed: deleted, lifetimeSeconds: seconds };
      }, Effect.uninterruptible);
      const get = Effect.fn("ChatSandboxes.get")(function* (owner: SandboxOwner) {
        const now = yield* Clock.currentTimeMillis;
        let entry = registry.get(key(owner));
        if (entry === undefined) {
          const [existing] = yield* list(labels(owner));
          if (existing !== undefined) entry = entryFor(existing, owner, now);
        }
        if (entry !== undefined) {
          registry.set(key(owner), entry);
          if (now - entry.createdAtMs >= CHAT_SANDBOX_LIMITS.lifetimeMinutes * 60_000) {
            yield* remove(entry);
            return yield* lifetimeTimeout();
          }
          if (entry.sandbox.state === "stopped") {
            yield* attempt("startChatSandbox", () => entry.sandbox.start()).pipe(
              Effect.catchTag("CloudError", (error) =>
                Effect.fail(
                  new SandboxUnavailable({
                    detail: "starting the existing sandbox failed",
                    cause: error.cause,
                  }),
                ),
              ),
            );
          }
          return entry.sandbox;
        }
        yield* meter.ensureAllowance(owner.userId);
        const userSandboxes = yield* list({ app: "ruth-chat", userId: owner.userId });
        if (userSandboxes.length >= CHAT_SANDBOX_LIMITS.maxPerUser)
          return yield* new SandboxQuotaExceeded({
            reason:
              "You already have three chat sandboxes. Close another thread's sandbox and try again.",
          });
        const common = {
          language: "python",
          ephemeral: true,
          autoStopInterval: CHAT_SANDBOX_LIMITS.idleStopMinutes,
          autoDeleteInterval: 0,
          labels: { ...labels(owner), createdAt: String(now) },
          ...Option.match(allowList, {
            onNone: () => ({ networkBlockAll: true }),
            onSome: (networkAllowList) => ({ networkAllowList }),
          }),
        };
        const sandbox = yield* attempt("createChatSandbox", () =>
          Option.isSome(snapshot)
            ? // Snapshot resources are fixed when the snapshot is built, never at sandbox creation.
              daytona.create({ ...common, snapshot: snapshot.value })
            : daytona.create({
                ...common,
                image: "daytonaio/sandbox",
                resources: CHAT_SANDBOX_LIMITS.resources,
              }),
        ).pipe(
          Effect.catchTag("CloudError", (error) =>
            Effect.fail(
              new SandboxUnavailable({ detail: "creating the sandbox failed", cause: error.cause }),
            ),
          ),
        );
        const created = entryFor(sandbox, owner, now);
        // Keep the entry if cleanup fails, so the sweeper/finalizer can retry deletion.
        registry.set(key(owner), created);
        yield* attempt("createChatWorkdir", () =>
          sandbox.fs.createFolder(CHAT_WORKDIR, "755"),
        ).pipe(
          Effect.catchTag("CloudError", (error) =>
            remove(created).pipe(
              Effect.andThen(
                Effect.fail(
                  new SandboxUnavailable({
                    detail: "preparing the working directory failed",
                    cause: error.cause,
                  }),
                ),
              ),
            ),
          ),
        );
        return sandbox;
      }, Effect.uninterruptible);
      // Only the lifecycle is serialised; commands run unlocked so one long command doesn't
      // stall the user's other threads, close, or the sweeper.
      const acquire = (owner: SandboxOwner) => locked(owner.userId, get(owner));
      yield* Effect.addFinalizer(() =>
        Effect.forEach(
          [...registry.values()],
          (entry) => locked(entry.owner.userId, remove(entry)),
          {
            discard: true,
          },
        ),
      );
      return ChatSandboxes.of({
        exec: Effect.fn("ChatSandboxes.exec")((owner, input) =>
          Effect.gen(function* () {
            const timeout = input.timeoutSeconds ?? CHAT_SANDBOX_LIMITS.commandTimeoutSeconds;
            if (
              !Number.isInteger(timeout) ||
              timeout < 1 ||
              timeout > CHAT_SANDBOX_LIMITS.maxCommandTimeoutSeconds
            )
              return yield* reject("Timeout must be an integer between 1 and 900 seconds");
            const cwd = yield* resolvePath(input.cwd ?? CHAT_WORKDIR);
            const sandbox = yield* acquire(owner);
            const start = yield* Clock.currentTimeMillis;
            const response = yield* attempt("chatExec", () =>
              sandbox.process.executeCommand(input.command, cwd, undefined, timeout),
            ).pipe(
              Effect.timeoutOrElse({
                duration: `${timeout + 30} seconds`,
                orElse: () =>
                  Effect.fail(new SandboxTimeout({ operation: "exec", timeoutSeconds: timeout })),
              }),
            );
            const bytes = Buffer.from(response.result);
            const truncated = bytes.length > CHAT_SANDBOX_LIMITS.maxOutputBytes;
            // Drop an incomplete UTF-8 prefix rather than introducing a replacement character.
            let offset = Math.max(0, bytes.length - CHAT_SANDBOX_LIMITS.maxOutputBytes);
            while (offset < bytes.length && (bytes[offset]! & 0xc0) === 0x80) offset++;
            return {
              exitCode: response.exitCode,
              output: bytes.subarray(offset).toString(),
              truncated,
              durationMs: (yield* Clock.currentTimeMillis) - start,
            };
          }),
        ),
        write: Effect.fn("ChatSandboxes.write")((owner, input) =>
          Effect.gen(function* () {
            const path = yield* resolvePath(input.path);
            if (input.bytes.length > CHAT_SANDBOX_LIMITS.maxWriteBytes)
              return yield* reject("File exceeds the 10 MB write limit");
            const sandbox = yield* acquire(owner);
            yield* attempt("createChatParent", () =>
              sandbox.fs.createFolder(posix.dirname(path), "755"),
            );
            yield* attempt("writeChatFile", () =>
              sandbox.fs.uploadFile(Buffer.from(input.bytes), path),
            );
            return { path, size: input.bytes.length };
          }),
        ),
        read: Effect.fn("ChatSandboxes.read")((owner, input) =>
          Effect.gen(function* () {
            const path = yield* resolvePath(input.path);
            const requested = input.maxBytes ?? CHAT_SANDBOX_LIMITS.maxReadBytes;
            if (!Number.isInteger(requested) || requested < 0)
              return yield* reject("maxBytes must be a non-negative integer");
            const max = Math.min(requested, CHAT_SANDBOX_LIMITS.maxReadBytes);
            const sandbox = yield* acquire(owner);
            const details = yield* attempt("statChatFile", () => sandbox.fs.getFileDetails(path));
            // Downloads are whole-file, so refuse files we could never return anyway.
            if (details.isDir || details.size > CHAT_SANDBOX_LIMITS.maxArtifactBytes)
              return yield* reject(
                "sandbox_read reads files up to 50 MB; use sandbox_exec (head, tail, grep) for larger ones",
              );
            const bytes = yield* attempt("readChatFile", () => sandbox.fs.downloadFile(path));
            return {
              path,
              bytes: new Uint8Array(bytes.subarray(0, max)),
              size: details.size,
              truncated: bytes.length > max || details.size > max,
            };
          }),
        ),
        readArtifact: Effect.fn("ChatSandboxes.readArtifact")((owner, input) =>
          Effect.gen(function* () {
            const path = yield* resolvePath(input.path);
            const sandbox = yield* acquire(owner);
            const missing = (
              error: CloudError,
            ): Effect.Effect<never, CloudError | SandboxInputRejected> =>
              error.cause instanceof DaytonaNotFoundError
                ? reject("Artifact does not exist")
                : Effect.fail(error);
            const details = yield* attempt("statChatArtifact", () =>
              sandbox.fs.getFileDetails(path),
            ).pipe(Effect.catchTag("CloudError", missing));
            if (details.isDir || details.size > CHAT_SANDBOX_LIMITS.maxArtifactBytes)
              return yield* reject("Artifact must be a file no larger than 50 MB");
            const bytes = yield* attempt("readChatArtifact", () =>
              sandbox.fs.downloadFile(path),
            ).pipe(Effect.catchTag("CloudError", missing));
            if (bytes.length > CHAT_SANDBOX_LIMITS.maxArtifactBytes)
              return yield* reject("Artifact exceeds the 50 MB limit");
            return { path, name: posix.basename(path), bytes: new Uint8Array(bytes) };
          }),
        ),
        close: Effect.fn("ChatSandboxes.close")((owner) =>
          locked(
            owner.userId,
            Effect.gen(function* () {
              let entry = registry.get(key(owner));
              if (entry === undefined) {
                const [sandbox] = yield* list(labels(owner));
                if (sandbox !== undefined)
                  entry = entryFor(sandbox, owner, yield* Clock.currentTimeMillis);
              }
              return entry === undefined
                ? { closed: false, lifetimeSeconds: 0 }
                : yield* remove(entry);
            }),
          ),
        ),
        sweep: Effect.gen(function* () {
          const sandboxes = yield* list({ app: "ruth-chat" });
          let count = 0;
          for (const sandbox of sandboxes) {
            const owner = {
              userId: sandbox.labels.userId ?? "",
              threadId: sandbox.labels.threadId ?? "",
            };
            yield* locked(
              owner.userId,
              Effect.gen(function* () {
                const now = yield* Clock.currentTimeMillis;
                const cached = registry.get(key(owner));
                const entry =
                  cached?.sandbox.id === sandbox.id ? cached : entryFor(sandbox, owner, now);
                if (
                  now - entry.createdAtMs >= CHAT_SANDBOX_LIMITS.lifetimeMinutes * 60_000 &&
                  (yield* remove(entry)).closed
                )
                  count++;
              }),
            );
          }
          return count;
        }),
      });
    }),
  );

/** The scope owns the sweeper fiber; failures are logged and the next tick still runs. */
export const ChatSandboxSweeperLive: Layer.Layer<never, never, ChatSandboxes> = Layer.effectDiscard(
  Effect.gen(function* () {
    const sandboxes = yield* ChatSandboxes;
    yield* Effect.repeat(
      sandboxes.sweep.pipe(
        Effect.catchCause((cause) => Effect.logWarning("Chat sandbox sweep failed", cause)),
      ),
      Schedule.spaced("5 minutes"),
    ).pipe(Effect.forkScoped);
  }),
);
