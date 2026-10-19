import { describe, expect, it } from "@effect/vitest";
import { DaytonaFileNotFoundError, DaytonaConnectionError, type Daytona } from "@daytonaio/sdk";
import * as Clock from "effect/Clock";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import { DaytonaClient } from "./daytona.ts";
import {
  CHAT_SANDBOX_LIMITS as limits,
  CHAT_WORKDIR,
  ChatSandboxes,
  ChatSandboxesLive,
  SandboxMeter,
  SandboxQuotaExceeded,
  type SandboxOwner,
} from "./chatSandbox.ts";
import { AVENIRE_SNAPSHOT } from "./snapshots.ts";

const owner: SandboxOwner = { userId: "user", threadId: "thread" };
type Params = {
  labels: Record<string, string>;
  snapshot?: string;
  image?: string;
  resources?: unknown;
  networkAllowList?: string;
  networkBlockAll?: boolean;
  ephemeral?: boolean;
  autoStopInterval?: number;
  autoDeleteInterval?: number;
};
const fake = () => {
  const created: Params[] = [];
  const records: { userId: string; seconds: number }[] = [];
  let nextId = 0;
  const boxes: ReturnType<typeof makeBox>[] = [];
  let quota = false;
  let failure = false;
  let output = "ok";
  let hang = false;
  let deleteFailure = false;
  let folderFailures = 0;
  const makeBox = (labels: Record<string, string>, state = "started", createdAt?: string) => {
    const files = new Map<string, Buffer>();
    const sizes = new Map<string, number>();
    const commands: unknown[][] = [];
    const folders: string[] = [];
    const sandbox = {
      id: `sandbox-${nextId++}`,
      labels,
      state,
      createdAt,
      deleted: 0,
      started: 0,
      async start() {
        if (failure) throw new Error("start failed");
        sandbox.started++;
        sandbox.state = "started";
      },
      async delete() {
        if (deleteFailure) throw new Error("delete failed");
        sandbox.deleted++;
        sandbox.state = "destroyed";
      },
      process: {
        async executeCommand(...args: unknown[]) {
          commands.push(args);
          if (hang) return await new Promise<never>(() => {});
          return { exitCode: 0, result: output };
        },
      },
      fs: {
        async createFolder(path: string) {
          if (folderFailures > 0) {
            folderFailures--;
            throw new DaytonaConnectionError("read ECONNRESET");
          }
          folders.push(path);
        },
        async uploadFile(bytes: Buffer, path: string) {
          files.set(path, bytes);
        },
        async downloadFile(path: string) {
          const bytes = files.get(path);
          if (!bytes) throw new DaytonaFileNotFoundError("missing");
          return bytes;
        },
        async getFileDetails(path: string) {
          const bytes = files.get(path);
          if (!bytes && !sizes.has(path)) throw new DaytonaFileNotFoundError("missing");
          return { size: sizes.get(path) ?? bytes!.length, isDir: false };
        },
      },
      files,
      sizes,
      commands,
      folders,
    };
    return sandbox;
  };
  const box = (...args: Parameters<typeof makeBox>) => {
    const sandbox = makeBox(...args);
    boxes.push(sandbox);
    return sandbox;
  };
  // One cast at the SDK boundary; the fake implements only the APIs this service uses.
  const client = {
    async *list({ labels }: { labels: Record<string, string> }) {
      for (const sandbox of boxes)
        if (
          sandbox.state !== "destroyed" &&
          Object.entries(labels).every(([key, value]) => sandbox.labels[key] === value)
        )
          yield sandbox;
    },
    async create(params: Params) {
      if (failure) throw new Error("creation failed");
      created.push(params);
      return box(params.labels);
    },
  } as unknown as Daytona;
  const meter = SandboxMeter.of({
    ensureAllowance: () =>
      quota
        ? Effect.fail(new SandboxQuotaExceeded({ reason: "Daily quota exhausted" }))
        : Effect.void,
    record: (userId, seconds) =>
      Effect.sync(() => {
        records.push({ userId, seconds });
      }),
  });
  const layer = ChatSandboxesLive.pipe(
    Layer.provide(
      Layer.merge(Layer.succeed(DaytonaClient, client), Layer.succeed(SandboxMeter, meter)),
    ),
  );
  return {
    layer,
    created,
    boxes,
    records,
    box,
    setQuota: (value = true) => {
      quota = value;
    },
    setFailure: () => {
      failure = true;
    },
    setOutput: (value: string) => {
      output = value;
    },
    setHang: () => {
      hang = true;
    },
    setFolderFailures: (value: number) => {
      folderFailures = value;
    },
    setDeleteFailure: (value: boolean) => {
      deleteFailure = value;
    },
  };
};
const provide = <A, E, R>(
  fixture: ReturnType<typeof fake>,
  effect: Effect.Effect<A, E, R | ChatSandboxes>,
  config: Record<string, string> = {},
) =>
  effect.pipe(
    Effect.provide(fixture.layer),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(config)),
  );
const exec = (service: ChatSandboxes["Service"], target = owner) =>
  service.exec(target, { command: "true" });

describe("ChatSandboxes", () => {
  it.effect("creates lazily once under concurrency, reuses, and separates threads", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        expect(f.created).toHaveLength(0);
        yield* Effect.all([exec(s), exec(s), exec(s)], { concurrency: "unbounded" });
        yield* exec(s);
        expect(f.created).toHaveLength(1);
        yield* exec(s, { ...owner, threadId: "other" });
        expect(f.created).toHaveLength(2);
        expect(f.boxes[0]!.commands).toHaveLength(4);
      }),
    );
  });
  it.effect("a long command does not block the user's other threads or close", () => {
    const f = fake();
    const other = { ...owner, threadId: "other" };
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* exec(s);
        yield* exec(s, other);
        f.setHang();
        const running = yield* Effect.forkChild(exec(s));
        yield* Effect.yieldNow;
        expect((yield* s.close(other)).closed).toBe(true);
        yield* Fiber.interrupt(running);
      }),
    );
  });
  it.effect("enforces maxPerUser even for simultaneous different threads", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* Effect.all(
          [0, 1, 2].map((i) => exec(s, { ...owner, threadId: String(i) })),
          { concurrency: "unbounded" },
        );
        const error = yield* Effect.flip(exec(s, { ...owner, threadId: "fourth" }));
        expect(error._tag).toBe("SandboxQuotaExceeded");
        expect(f.created).toHaveLength(3);
      }),
    );
  });
  it.effect("maps creation failures to an actionable unavailable error", () => {
    const f = fake();
    f.setFailure();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        const error = yield* Effect.flip(exec(s));
        expect(error._tag).toBe("SandboxUnavailable");
        expect(error.message).toContain("answer without running code");
      }),
    );
  });
  it.effect("recovers a stopped labeled sandbox across restart without quota or creation", () => {
    const f = fake();
    f.setQuota();
    return provide(
      f,
      Effect.gen(function* () {
        const b = f.box(
          { app: "ruth-chat", ...owner, createdAt: String(yield* Clock.currentTimeMillis) },
          "stopped",
        );
        const s = yield* ChatSandboxes;
        yield* exec(s);
        expect(b.started).toBe(1);
        expect(f.created).toHaveLength(0);
      }),
    );
  });
  it.effect("confines normalized paths, rejects NUL, and creates write parents", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        for (const path of [
          "/etc/passwd",
          "../../etc",
          "a\0b",
          "/tmp/../etc",
          "/home/daytonax/file",
        ]) {
          expect((yield* Effect.flip(s.write(owner, { path, bytes: new Uint8Array() })))._tag).toBe(
            "SandboxInputRejected",
          );
        }
        expect(f.created).toHaveLength(0);
        expect(
          yield* s.write(owner, { path: "nested/a.txt", bytes: new Uint8Array([1, 2]) }),
        ).toEqual({ path: `${CHAT_WORKDIR}/nested/a.txt`, size: 2 });
        expect(f.boxes[0]!.folders).toContain(`${CHAT_WORKDIR}/nested`);
        yield* s.write(owner, { path: "/tmp/a", bytes: new Uint8Array() });
        expect(
          (yield* Effect.flip(
            s.write(owner, { path: "big", bytes: new Uint8Array(limits.maxWriteBytes + 1) }),
          ))._tag,
        ).toBe("SandboxInputRejected");
      }),
    );
  });
  it.effect(
    "allows figure source reads but rejects toolchain writes and oversized artifact downloads",
    () => {
      const f = fake();
      return provide(
        f,
        Effect.gen(function* () {
          const s = yield* ChatSandboxes;
          yield* exec(s);
          const box = f.boxes[0]!;
          const path = "/opt/avenire/figures/references/craft.md";
          box.files.set(path, Buffer.from("Craft"));
          expect(new TextDecoder().decode((yield* s.read(owner, { path })).bytes)).toBe("Craft");
          expect((yield* Effect.flip(s.write(owner, { path, bytes: new Uint8Array() })))._tag).toBe(
            "SandboxInputRejected",
          );
          expect(
            (yield* Effect.flip(s.read(owner, { path: "/opt/avenire/figuresx/LICENSE" })))._tag,
          ).toBe("SandboxInputRejected");
          box.sizes.set(`${CHAT_WORKDIR}/large.html`, 8 * 1024 * 1024 + 1);
          expect(
            (yield* Effect.flip(
              s.readArtifact(owner, { path: "large.html", maxBytes: 8 * 1024 * 1024 }),
            ))._tag,
          ).toBe("SandboxInputRejected");
        }),
      );
    },
  );
  it.effect("honours configured hard lifetime and idle stop", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* exec(s);
        expect(f.created[0]!.autoStopInterval).toBe(10);
        yield* TestClock.adjust("5 minutes");
        expect((yield* Effect.flip(exec(s)))._tag).toBe("SandboxTimeout");
        expect(f.boxes[0]!.deleted).toBe(1);
      }),
      { CHAT_SANDBOX_LIFETIME_MINUTES: "5", CHAT_SANDBOX_IDLE_STOP_MINUTES: "10" },
    );
  });
  it.effect("keeps the output tail within the UTF-8 byte limit", () => {
    const f = fake();
    f.setOutput("é".repeat(limits.maxOutputBytes) + "ERROR END");
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        const result = yield* exec(s);
        expect(result.truncated).toBe(true);
        expect(result.output.endsWith("ERROR END")).toBe(true);
        expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(limits.maxOutputBytes);
        expect(result.output).not.toContain("�");
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
      }),
    );
  });
  it.effect("returns first read bytes, original size, and enforces the read ceiling", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* s.write(owner, { path: "file", bytes: Buffer.from("abcdef") });
        const result = yield* s.read(owner, { path: "file", maxBytes: 3 });
        expect(Buffer.from(result.bytes).toString()).toBe("abc");
        expect(result.size).toBe(6);
        expect(result.truncated).toBe(true);
        f.boxes[0]!.files.set(`${CHAT_WORKDIR}/file`, Buffer.alloc(limits.maxReadBytes + 1));
        expect(
          (yield* s.read(owner, { path: "file", maxBytes: limits.maxReadBytes * 2 })).bytes.length,
        ).toBe(limits.maxReadBytes);
        expect((yield* Effect.flip(s.read(owner, { path: "file", maxBytes: -1 })))._tag).toBe(
          "SandboxInputRejected",
        );
      }),
    );
  });
  it.effect("close records lifetime once, deletes, and is idempotent", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* exec(s);
        yield* TestClock.adjust("10 seconds");
        expect(yield* s.close(owner)).toEqual({ closed: true, lifetimeSeconds: 10 });
        expect(yield* s.close(owner)).toEqual({ closed: false, lifetimeSeconds: 0 });
        expect(f.records).toEqual([{ userId: owner.userId, seconds: 10 }]);
        expect(f.boxes[0]!.deleted).toBe(1);
      }),
    );
  });
  it.effect("hard cap deletes and fails; next call creates subject to quota", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* ChatSandboxes;
        yield* exec(s);
        yield* TestClock.adjust(`${limits.lifetimeMinutes} minutes`);
        const error = yield* Effect.flip(exec(s));
        expect(error._tag).toBe("SandboxTimeout");
        if (error._tag === "SandboxTimeout") expect(error.operation).toBe("lifetime");
        expect(error.message).toContain("next call");
        expect(f.boxes[0]!.deleted).toBe(1);
        expect(f.records[0]!.seconds).toBe(limits.lifetimeMinutes * 60);
        f.setQuota();
        expect((yield* Effect.flip(exec(s)))._tag).toBe("SandboxQuotaExceeded");
        expect(f.created).toHaveLength(1);
      }),
    );
  });
  it.effect("sweeps only expired sandboxes, including SDK timestamp fallback", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        yield* TestClock.adjust("3 hours");
        const s = yield* ChatSandboxes;
        yield* exec(s);
        const now = yield* Clock.currentTimeMillis;
        const old = f.box(
          { app: "ruth-chat", userId: "other", threadId: "old" },
          "started",
          new Date(now - limits.lifetimeMinutes * 60_000 - 1).toISOString(),
        );
        const fresh = f.box({
          app: "ruth-chat",
          userId: "other",
          threadId: "fresh",
          createdAt: String(now),
        });
        const unrelated = f.box({ app: "ruth-cloud", userId: "other", createdAt: "0" });
        expect(yield* s.sweep).toBe(1);
        expect(old.deleted).toBe(1);
        expect(fresh.deleted).toBe(0);
        expect(unrelated.deleted).toBe(0);
        expect(yield* s.sweep).toBe(0);
      }),
    );
  });
  for (const allow of [undefined, "10.0.0.0/8,192.168.0.0/16"]) {
    it.effect(
      `configures network ${allow === undefined ? "block-all" : "allow-list"} and snapshot resources`,
      () => {
        const f = fake();
        return provide(
          f,
          Effect.gen(function* () {
            const s = yield* ChatSandboxes;
            yield* exec(s);
            const params = f.created[0]!;
            expect(params.ephemeral).toBe(true);
            expect(params.autoDeleteInterval).toBe(0);
            expect(params.autoStopInterval).toBe(limits.idleStopMinutes);
            if (allow === undefined) {
              expect(params.networkBlockAll).toBe(true);
              expect(params.networkAllowList).toBeUndefined();
            } else {
              expect(params.networkAllowList).toBe(allow);
              expect(params.networkBlockAll).toBeUndefined();
            }
            expect(params.snapshot).toBe(AVENIRE_SNAPSHOT);
            expect(params.resources).toBeUndefined();
            expect(params.image).toBeUndefined();
          }),
          allow === undefined ? {} : { CHAT_SANDBOX_NETWORK_ALLOW_LIST: allow },
        );
      },
    );
  }
  it.effect("layer shutdown deletes registered sandboxes", () => {
    const f = fake();
    return Effect.gen(function* () {
      yield* provide(
        f,
        Effect.gen(function* () {
          const s = yield* ChatSandboxes;
          yield* exec(s);
        }),
      );
      expect(f.boxes[0]!.deleted).toBe(1);
      expect(f.records).toHaveLength(1);
    });
  });
});
