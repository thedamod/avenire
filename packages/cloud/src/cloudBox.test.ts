import { describe, expect, it } from "@effect/vitest";
import { DaytonaFileNotFoundError, type Daytona } from "@daytonaio/sdk";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  CLOUD_INPUTS,
  CLOUD_LIMITS,
  CLOUD_WORKSPACE,
  CloudBoxes,
  CloudBoxesLive,
  tokenSecretName,
} from "./cloudBox.ts";
import { DaytonaClient } from "./daytona.ts";
import { avenireRuthCloudImage, ensureSnapshot, PI_VERSION } from "./snapshots.ts";

type Params = { labels: Record<string, string>; [key: string]: unknown };
const fake = () => {
  const created: Params[] = [];
  const calls: string[] = [];
  const secrets = new Map<string, { id: string; name: string; value: string; hosts: string[] }>();
  let nextId = 0;
  let fail = false;
  const makeBox = (userId: string, state = "started") => {
    const files = new Map<string, Buffer>();
    const sizes = new Map<string, number>();
    const folders: string[] = [];
    const commands: unknown[][] = [];
    let downloaded = 0;
    const sandbox = {
      id: `box-${nextId++}`,
      labels: { app: "ruth-cloud", userId },
      state,
      started: 0,
      stopped: 0,
      async start() {
        if (fail) throw new Error("failed");
        sandbox.started++;
        sandbox.state = "started";
      },
      async stop() {
        sandbox.stopped++;
        sandbox.state = "stopped";
      },
      fs: {
        async createFolder(path: string) {
          folders.push(path);
        },
        async uploadFile(bytes: Buffer, path: string) {
          files.set(path, bytes);
        },
        async downloadFile(path: string) {
          downloaded++;
          return files.get(path) ?? Buffer.from("recording");
        },
        async getFileDetails(path: string) {
          if (!files.has(path) && !sizes.has(path)) throw new DaytonaFileNotFoundError("missing");
          return { size: sizes.get(path) ?? files.get(path)!.length, isDir: false };
        },
        async deleteFile(path: string) {
          files.delete(path);
        },
      },
      process: {
        async executeCommand(...args: unknown[]) {
          commands.push(args);
          return { exitCode: 2, result: "output" };
        },
        async createSession(id: string) {
          calls.push(`session:${id}`);
        },
        async executeSessionCommand(...args: unknown[]) {
          commands.push(args);
          return { cmdId: "cmd" };
        },
        async getSessionCommand() {
          return { exitCode: undefined };
        },
        async getSessionCommandLogs() {
          return { output: "start END" };
        },
        async deleteSession(id: string) {
          calls.push(`end:${id}`);
        },
      },
      computerUse: {
        async start() {
          calls.push("desktop");
        },
        recording: {
          async start(name: string) {
            calls.push(`record:${name}`);
            return { id: "recording" };
          },
          async stop(id: string) {
            calls.push(`stop-record:${id}`);
            return { filePath: "/recording.mp4" };
          },
        },
      },
      files,
      sizes,
      folders,
      commands,
      downloads: () => downloaded,
    };
    return sandbox;
  };
  const boxes: ReturnType<typeof makeBox>[] = [];
  const box = (userId: string, state = "started") => {
    const sandbox = makeBox(userId, state);
    boxes.push(sandbox);
    return sandbox;
  };
  const client = {
    async *list({ labels }: { labels: Record<string, string> }) {
      for (const sandbox of boxes)
        if (
          Object.entries(labels).every(
            ([key, value]) => sandbox.labels[key as keyof typeof sandbox.labels] === value,
          )
        )
          yield sandbox;
    },
    async create(params: Params) {
      calls.push("create-box");
      if (fail) throw new Error("failed");
      created.push(params);
      return box(params.labels.userId!);
    },
    secret: {
      async list() {
        return { items: [...secrets.values()], nextCursor: null };
      },
      async create(input: { name: string; value: string; hosts: string[] }) {
        calls.push("create-secret");
        const secret = { id: `secret-${secrets.size}`, ...input };
        secrets.set(input.name, secret);
        return secret;
      },
      async update(id: string, input: { value: string; hosts: string[] }) {
        calls.push(`update-secret:${id}`);
        const secret = [...secrets.values()].find((secret) => secret.id === id)!;
        Object.assign(secret, input);
        return secret;
      },
    },
  } as unknown as Daytona;
  return {
    created,
    calls,
    secrets,
    boxes,
    box,
    fail: () => {
      fail = true;
    },
    layer: CloudBoxesLive.pipe(Layer.provide(Layer.succeed(DaytonaClient, client))),
  };
};
const config = {
  RUTH_CLOUD_API_BASE_URL: "https://api.avenire.test/v1",
  RUTH_CLOUD_EGRESS_CIDRS: "1.2.3.4/32, 10.0.0.0/24",
};
const provide = <A, E, R>(
  fixture: ReturnType<typeof fake>,
  effect: Effect.Effect<A, E, R | CloudBoxes>,
  extra: Record<string, string> = {},
) =>
  effect.pipe(
    Effect.provide(fixture.layer),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ ...config, ...extra }),
    ),
  );

describe("CloudBoxes", () => {
  it.effect("creates once concurrently, reuses, and mounts existing secret names", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* CloudBoxes;
        const boxes = yield* Effect.all([s.ensure("user"), s.ensure("user"), s.ensure("user")], {
          concurrency: "unbounded",
        });
        expect(new Set(boxes.map((box) => box.id)).size).toBe(1);
        expect(f.created).toHaveLength(1);
        expect(f.created[0]).toMatchObject({
          labels: { app: "ruth-cloud", userId: "user" },
          resources: CLOUD_LIMITS.resources,
          autoStopInterval: 15,
          autoArchiveInterval: 10080,
          autoDeleteInterval: -1,
          ephemeral: false,
          networkAllowList: "1.2.3.4/32,10.0.0.0/24",
          secrets: {
            ANTHROPIC_API_KEY: "ruth-cloud-model-key",
            AVENIRE_RUN_TOKEN: "ruth-cloud-token-user",
          },
        });
        expect(f.calls.indexOf("create-secret")).toBeLessThan(f.calls.indexOf("create-box"));
        expect(f.secrets.get(tokenSecretName("user"))?.hosts).toEqual(["api.avenire.test"]);
        expect(f.boxes[0]?.folders).toContain(CLOUD_WORKSPACE);
        expect(f.boxes[0]?.folders).toContain(CLOUD_INPUTS);
      }),
    );
  });
  it.effect("snapshot creation omits resource overrides", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        yield* (yield* CloudBoxes).ensure("user");
        expect(f.created[0]).toHaveProperty("snapshot", "custom");
        expect(f.created[0]).not.toHaveProperty("resources");
        expect(f.created[0]).not.toHaveProperty("image");
      }),
      { DAYTONA_RUTH_CLOUD_SNAPSHOT: "custom" },
    );
  });
  for (const state of ["stopped", "archived"])
    it.effect(`starts a ${state} box`, () => {
      const f = fake();
      const b = f.box("user", state);
      return provide(
        f,
        Effect.gen(function* () {
          yield* (yield* CloudBoxes).ensure("user");
          expect(b.started).toBe(1);
          expect(f.created).toHaveLength(0);
        }),
      );
    });
  it.effect("creation and start failures become SandboxUnavailable", () => {
    const f = fake();
    f.fail();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* CloudBoxes;
        expect((yield* Effect.flip(s.ensure("user")))._tag).toBe("SandboxUnavailable");
        f.box("existing", "stopped");
        expect((yield* Effect.flip(s.ensure("existing")))._tag).toBe("SandboxUnavailable");
      }),
    );
  });
  it.effect("running never creates or starts; stop is idempotent", () => {
    const f = fake();
    const b = f.box("user");
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* CloudBoxes;
        expect(Option.isNone(yield* s.running("absent"))).toBe(true);
        expect(Option.isSome(yield* s.running("user"))).toBe(true);
        yield* s.stop("user");
        yield* s.stop("user");
        yield* s.stop("absent");
        expect(b.stopped).toBe(1);
        expect(Option.isNone(yield* s.running("user"))).toBe(true);
        expect(b.started).toBe(0);
        expect(f.created).toHaveLength(0);
      }),
    );
  });
  it.effect("set and clear update the secret by id with a fresh dead token", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const s = yield* CloudBoxes;
        yield* s.setRunToken("user", "live-token");
        expect(f.secrets.get(tokenSecretName("user"))?.value).toBe("live-token");
        yield* s.ensure("user");
        expect(f.secrets.get(tokenSecretName("user"))?.value).toBe("live-token");
        yield* s.clearRunToken("user");
        const first = f.secrets.get(tokenSecretName("user"))?.value;
        yield* s.clearRunToken("user");
        const second = f.secrets.get(tokenSecretName("user"))?.value;
        expect(first).not.toBe("live-token");
        expect(first).not.toBe(second);
        expect(f.calls.filter((call) => call === "create-secret")).toHaveLength(1);
        expect(f.calls).toContain("update-secret:secret-0");
      }),
    );
  });
  it.effect("checks size before download, creates parents, and exposes missing file info", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const box = yield* (yield* CloudBoxes).ensure("user");
        const b = f.boxes[0]!;
        yield* box.writeFile(`${CLOUD_WORKSPACE}/nested/a`, new Uint8Array([1, 2]));
        expect(b.folders).toContain(`${CLOUD_WORKSPACE}/nested`);
        expect(yield* box.readFile(`${CLOUD_WORKSPACE}/nested/a`)).toEqual(new Uint8Array([1, 2]));
        b.sizes.set("/huge", CLOUD_LIMITS.maxReadBytes + 1);
        expect((yield* Effect.flip(box.readFile("/huge")))._tag).toBe("SandboxInputRejected");
        expect(b.downloads()).toBe(1);
        expect(Option.isNone(yield* box.fileInfo("/missing"))).toBe(true);
        yield* box.removeFile(`${CLOUD_WORKSPACE}/nested/a`);
        expect(b.files.size).toBe(0);
      }),
    );
  });
  it.effect("exec/session polling and desktop recording use SDK APIs", () => {
    const f = fake();
    return provide(
      f,
      Effect.gen(function* () {
        const box = yield* (yield* CloudBoxes).ensure("user");
        expect(yield* box.exec("false")).toEqual({ exitCode: 2, output: "output" });
        expect(
          yield* box.startCommand({ sessionId: "run", command: "pi -p", cwd: "/a'b" }),
        ).toEqual({ commandId: "cmd" });
        expect(f.boxes[0]?.commands[1]).toEqual([
          "run",
          { command: "cd '/a'\\''b' && pi -p", runAsync: true },
        ]);
        expect(yield* box.commandStatus("run", "cmd")).toEqual({ exitCode: null });
        expect(yield* box.commandLogs("run", "cmd", 3)).toBe("END");
        expect(yield* box.commandLogs("run", "cmd", 0)).toBe("");
        yield* box.endSession("run");
        yield* box.startDesktop;
        expect(yield* box.startRecording("name")).toEqual(Option.some("recording"));
        expect(Option.isSome(yield* box.stopRecording("recording"))).toBe(true);
      }),
    );
  });
  it.effect("rejects missing/invalid/too-long CIDR config before creation", () => {
    const f = fake();
    return Effect.forEach(
      ["", "example.test", "300.1.1.1/32", "1.2.3.4/33", Array(11).fill("1.2.3.4/32").join(",")],
      (egress) =>
        provide(
          f,
          Effect.gen(function* () {
            yield* CloudBoxes;
          }),
          { RUTH_CLOUD_EGRESS_CIDRS: egress },
        ).pipe(
          Effect.exit,
          Effect.map((exit) => expect(exit._tag).toBe("Failure")),
        ),
    ).pipe(Effect.asVoid);
  });
});
it("cloud image retains desktop base and pins Pi/Node", () => {
  expect(avenireRuthCloudImage.dockerfile).toContain("FROM daytonaio/sandbox");
  expect(avenireRuthCloudImage.dockerfile).toContain(
    `@earendil-works/pi-coding-agent@${PI_VERSION}`,
  );
  expect(avenireRuthCloudImage.dockerfile).toContain("setup_24.x");
  expect(avenireRuthCloudImage.dockerfile).toContain("playwright install --with-deps chromium");
});
it.effect("ensureSnapshot uses the requested allocation", () => {
  let params: unknown;
  const daytona = {
    snapshot: {
      get: async () => {
        throw new DaytonaFileNotFoundError("missing");
      },
      create: async (input: unknown) => {
        params = input;
        return {};
      },
    },
  } as unknown as Daytona;
  return Effect.gen(function* () {
    yield* ensureSnapshot(daytona, "cloud", avenireRuthCloudImage, CLOUD_LIMITS.resources);
    expect(params).toMatchObject({ name: "cloud", resources: CLOUD_LIMITS.resources });
  });
});
it.effect("recording returns None when computer use is unavailable", () => {
  const f = fake();
  const sandbox = f.box("user");
  Reflect.deleteProperty(sandbox, "computerUse");
  return provide(
    f,
    Effect.gen(function* () {
      const box = yield* (yield* CloudBoxes).ensure("user");
      expect(Option.isNone(yield* box.startRecording("run"))).toBe(true);
      expect(Option.isNone(yield* box.stopRecording("unavailable"))).toBe(true);
    }),
  );
});
