import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ByteSize from "effect/ByteSize";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as Spawner from "effect/process/ChildProcessSpawner";
import { frameSelection, MEDIA_LIMITS, MediaProcessor, MediaProcessorLive } from "./media.ts";

const harness = (
  options: {
    width?: number;
    duration?: number;
    excessiveFrames?: boolean;
    excessiveOutput?: boolean;
    excessiveJpeg?: boolean;
  } = {},
) => {
  const commands: ChildProcess.StandardCommand[] = [];
  const reads: string[] = [];
  const writes: string[] = [];
  let cleaned = false;
  const fs = FileSystem.layerNoop({
    makeTempDirectoryScoped: () =>
      Effect.acquireRelease(Effect.succeed("/test/media"), () =>
        Effect.sync(() => {
          cleaned = true;
        }),
      ),
    writeFile: (path) =>
      Effect.sync(() => {
        writes.push(path);
      }),
    stat: (path) =>
      Effect.succeed({
        type: "File",
        mtime: Option.none(),
        atime: Option.none(),
        birthtime: Option.none(),
        dev: 0,
        ino: Option.none(),
        mode: 0o600,
        nlink: Option.none(),
        uid: Option.none(),
        gid: Option.none(),
        rdev: Option.none(),
        blksize: Option.none(),
        blocks: Option.none(),
        size: ByteSize.bytes(
          path.endsWith("hashes.gray")
            ? 64 * 3
            : options.excessiveJpeg
              ? MEDIA_LIMITS.frameBytes + 1
              : 3,
        ),
      }),
    readFile: (path) =>
      Effect.sync(() => {
        reads.push(path);
        return path.endsWith("hashes.gray") ? new Uint8Array(64 * 3) : new Uint8Array([1, 2, 3]);
      }),
  });
  const spawner = Layer.succeed(
    Spawner.ChildProcessSpawner,
    Spawner.make((command) =>
      Effect.sync(() => {
        if (command._tag !== "StandardCommand") throw new Error("Unexpected pipeline");
        commands.push(command);
        const text =
          command.command === "ffprobe"
            ? JSON.stringify({
                format: { duration: String(options.duration ?? 600) },
                streams: [
                  { index: 0, codec_type: "video", width: options.width ?? 1920, height: 1080 },
                ],
              })
            : Array.from(
                { length: options.excessiveFrames ? 1000 : 3 },
                (_, index) => `showinfo pts_time: ${index * 250}\n`,
              ).join("");
        const output = Stream.make(new TextEncoder().encode(text));
        return Spawner.makeHandle({
          pid: Spawner.ProcessId(1),
          exitCode: Effect.succeed(Spawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: options.excessiveOutput
            ? Stream.make(new Uint8Array(MEDIA_LIMITS.outputBytes + 1))
            : output,
          stderr: Stream.empty,
          all: output,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        });
      }),
    ),
  );
  return {
    layer: MediaProcessorLive.pipe(Layer.provide(Layer.merge(fs, spawner))),
    commands,
    reads,
    writes,
    cleaned: () => cleaned,
  };
};

describe("bounded media subprocesses", () => {
  it.effect("shares one source file and one probe across a media extraction session", () =>
    Effect.gen(function* () {
      const test = harness();
      yield* Effect.gen(function* () {
        const media = yield* MediaProcessor;
        const bytes = new Uint8Array([1, 2, 3]);
        yield* media.withSource!(
          bytes,
          Effect.gen(function* () {
            yield* media.probe(bytes);
            yield* media.sceneFrames(bytes, { maxFrames: 3 });
            yield* media.probe(bytes);
          }),
        );
      }).pipe(Effect.provide(test.layer));
      expect(test.writes).toEqual(["/test/media/source"]);
      expect(test.commands.filter((command) => command.command === "ffprobe")).toHaveLength(1);
      expect(test.cleaned()).toBe(true);
    }),
  );
  it.effect(
    "caps JPEG production and buffers before allocation, spreads samples and releases temp files",
    () =>
      Effect.gen(function* () {
        const test = harness();
        const result = yield* Effect.gen(function* () {
          return yield* (yield* MediaProcessor).sceneFrames(new Uint8Array([1]), { maxFrames: 3 });
        }).pipe(Effect.provide(test.layer));
        expect(result.length).toBeGreaterThan(0);
        expect(test.reads.filter((path) => path.endsWith(".jpg"))).toHaveLength(3);
        const ffmpeg = test.commands.find((command) => command.command === "ffmpeg")!;
        expect(ffmpeg.args.filter((arg) => arg === "-frames:v")).toHaveLength(2);
        expect(ffmpeg.args.join(" ")).toContain("-frames:v 3");
        expect(ffmpeg.args.join(" ")).toContain("-t 600");
        expect(ffmpeg.args.join(" ")).toContain("-protocol_whitelist file,pipe");
        expect(ffmpeg.args.join(" ")).toContain("gte(t-prev_selected_t,300)");
        expect(ffmpeg.options.forceKillAfter).toBe("1 second");
        expect(test.cleaned()).toBe(true);
      }),
  );

  it.effect("rejects excessive pixel dimensions before spawning ffmpeg", () =>
    Effect.gen(function* () {
      const test = harness({ width: 16000 });
      const result = yield* Effect.gen(function* () {
        return yield* Effect.result(
          (yield* MediaProcessor).sceneFrames(new Uint8Array([1]), { maxFrames: 120 }),
        );
      }).pipe(Effect.provide(test.layer));
      expect(result._tag).toBe("Failure");
      expect(test.commands.map((command) => command.command)).toEqual(["ffprobe"]);
      expect(test.reads).toEqual([]);
      expect(test.cleaned()).toBe(true);
    }),
  );

  it.effect("rejects producer overflow before reading any JPEG buffers", () =>
    Effect.gen(function* () {
      const test = harness({ excessiveFrames: true });
      const result = yield* Effect.gen(function* () {
        return yield* Effect.result(
          (yield* MediaProcessor).sceneFrames(new Uint8Array([1]), { maxFrames: 3 }),
        );
      }).pipe(Effect.provide(test.layer));
      expect(result._tag).toBe("Failure");
      expect(test.reads.filter((path) => path.endsWith(".jpg"))).toEqual([]);
      expect(test.cleaned()).toBe(true);
    }),
  );

  it.effect("rejects an oversized JPEG before allocating its buffer", () =>
    Effect.gen(function* () {
      const test = harness({ excessiveJpeg: true });
      const result = yield* Effect.gen(function* () {
        return yield* Effect.result(
          (yield* MediaProcessor).sceneFrames(new Uint8Array([1]), { maxFrames: 3 }),
        );
      }).pipe(Effect.provide(test.layer));
      expect(result._tag).toBe("Failure");
      expect(test.reads.filter((path) => path.endsWith(".jpg"))).toEqual([]);
      expect(test.cleaned()).toBe(true);
    }),
  );

  it.effect("bounds subprocess output and source duration", () =>
    Effect.gen(function* () {
      for (const options of [
        { excessiveOutput: true },
        { duration: MEDIA_LIMITS.durationSec + 1 },
      ]) {
        const test = harness(options);
        const result = yield* Effect.gen(function* () {
          return yield* Effect.result((yield* MediaProcessor).probe(new Uint8Array([1])));
        }).pipe(Effect.provide(test.layer));
        expect(result._tag).toBe("Failure");
        expect(test.cleaned()).toBe(true);
      }
    }),
  );

  it("caps a huge requested frame count and processing duration", () => {
    const selection = frameSelection(24 * 3600, 100000);
    expect(selection.maxFrames).toBe(120);
    expect(selection.duration).toBe(6 * 3600);
  });
});

// A real local ffmpeg process verifies filter syntax and output bounds without network/providers.
describe("synthetic local media", () => {
  it("caps produced files and preserves later timeline samples", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const { mkdtemp, readdir, rm, stat } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { sceneFrameArguments } = await import("./media.ts");
    const exec = promisify(execFile);
    const directory = await mkdtemp(join(tmpdir(), "avenire-frame-test-"));
    try {
      const source = join(directory, "source.mkv");
      await exec(
        "ffmpeg",
        [
          "-nostdin",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=128x96:rate=1",
          "-t",
          "60",
          "-c:v",
          "ffv1",
          "-threads",
          "1",
          source,
        ],
        { timeout: 30000 },
      );
      const { stderr } = await exec(
        "ffmpeg",
        [...sceneFrameArguments(source, directory, frameSelection(60, 3))],
        { timeout: 30000, maxBuffer: MEDIA_LIMITS.outputBytes },
      );
      const jpegs = (await readdir(directory)).filter((file) => file.endsWith(".jpg"));
      expect(jpegs.length).toBeGreaterThan(1);
      expect(jpegs.length).toBeLessThanOrEqual(3);
      expect((await stat(join(directory, "hashes.gray"))).size).toBeLessThanOrEqual(64 * 3);
      const times = [...stderr.matchAll(/showinfo.*?pts_time:\s*([\d.]+)/g)].map((match) =>
        Number(match[1]),
      );
      expect(Math.max(...times)).toBeGreaterThanOrEqual(30);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
