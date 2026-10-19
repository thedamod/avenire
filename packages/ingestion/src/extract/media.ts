/** ffmpeg/ffprobe work on audio and video files: probing, audio segments, slide frames. */
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import * as Schema from "effect/Schema";

export class MediaError extends Schema.TaggedError<MediaError>()("MediaError", {
  operation: Schema.Literals(["probe", "audio", "frames", "captions"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Media ${this.operation} failed`;
  }
}

export interface AudioSegment {
  /** Where the segment starts in the source, for re-timing its transcript. */
  readonly offsetSec: number;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface Frame {
  readonly atSec: number;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export class MediaProcessor extends Context.Service<
  MediaProcessor,
  {
    /** Duration in seconds, and whether there is a video stream. */
    readonly probe: (media: Uint8Array) => Effect.Effect<
      {
        readonly durationSec: number;
        readonly hasVideo: boolean;
        readonly subtitleStreamIndex?: number;
      },
      MediaError
    >;
    /** Converts the first supported subtitle stream to WebVTT. */
    readonly embeddedCaptions: (
      media: Uint8Array,
      streamIndex: number,
    ) => Effect.Effect<string, MediaError>;
    /** Mono 16 kHz compressed audio in overlapping segments, up to `maxSec` of the source. */
    readonly audioSegments: (
      media: Uint8Array,
      options: {
        readonly segmentSec: number;
        readonly overlapSec: number;
        readonly maxSec: number;
      },
    ) => Effect.Effect<ReadonlyArray<AudioSegment>, MediaError>;
    /** Frames at scene changes (slide transitions), near-duplicates dropped, at most `maxFrames`. */
    readonly sceneFrames: (
      media: Uint8Array,
      options: { readonly maxFrames: number },
    ) => Effect.Effect<ReadonlyArray<Frame>, MediaError>;
  }
>()("avenire/ingestion/MediaProcessor") {}

const Probe = Schema.fromJsonString(
  Schema.Struct({
    format: Schema.Struct({ duration: Schema.optional(Schema.String) }),
    streams: Schema.Array(
      Schema.Struct({
        index: Schema.Number,
        codec_type: Schema.String,
        codec_name: Schema.optionalKey(Schema.String),
      }),
    ),
  }),
);

/** Wall-clock limits per subprocess; v1 had none and could hang a worker. */
const PROBE_TIMEOUT = "20 seconds";
const SEGMENT_TIMEOUT = "90 seconds";
const CAPTIONS_TIMEOUT = "2 minutes";
const FRAMES_TIMEOUT = "5 minutes";
/** A frame is taken at a scene change, or at the latest this long after the previous one. */
const MAX_FRAME_GAP_SEC = 30;
/** Average-hash bits two frames may differ by and still count as the same slide. */
const SAME_SLIDE_BITS = 6;
/** 8×8 grayscale frames, one byte per pixel, for the average hash. */
const HASH_PIXELS = 64;

/** Evenly spread `max` of `files`, keeping the first. */
const spread = <A>(files: ReadonlyArray<A>, max: number): ReadonlyArray<A> =>
  files.length <= max
    ? files
    : Array.from(
        { length: max },
        (_, index) => files[Math.round((index * (files.length - 1)) / Math.max(1, max - 1))],
      ).filter((file): file is A => file !== undefined);

const averageHash = (pixels: Uint8Array): bigint => {
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  return pixels.reduce(
    (bits, value, index) => (value >= mean ? bits | (1n << BigInt(index)) : bits),
    0n,
  );
};

const differingBits = (a: bigint, b: bigint): number =>
  (a ^ b).toString(2).replaceAll("0", "").length;

/** Drops frames that look like the frame kept before them (the same slide). */
export const distinctFrames = <F>(
  frames: ReadonlyArray<{ readonly frame: F; readonly hash: bigint }>,
) => {
  const kept: Array<{ readonly frame: F; readonly hash: bigint }> = [];
  for (const entry of frames) {
    const last = kept.at(-1);
    if (last === undefined || differingBits(last.hash, entry.hash) > SAME_SLIDE_BITS)
      kept.push(entry);
  }
  return kept;
};

export const MediaProcessorLive = Layer.effect(
  MediaProcessor,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    /** Runs a tool to completion; resolves to its output (stdout, or all output for ffmpeg). */
    const run = (
      executable: "ffmpeg" | "ffprobe",
      args: ReadonlyArray<string>,
      timeout: Duration.Input,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(ChildProcess.make(executable, args));
          const [output, code] = yield* Effect.all(
            [
              Stream.mkString(
                Stream.decodeText(executable === "ffmpeg" ? handle.all : handle.stdout),
              ),
              handle.exitCode,
            ],
            { concurrency: 2 },
          );
          if (code !== 0) return yield* Effect.fail(`${executable} exited with code ${code}`);
          return output;
        }),
      ).pipe(Effect.timeout(timeout));

    /** Writes `media` to a scoped temp directory, which is removed afterwards. */
    const withFile = <A, E>(
      media: Uint8Array,
      use: (path: string, directory: string) => Effect.Effect<A, E>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const directory = yield* fs.makeTempDirectoryScoped({ prefix: "avenire-media-" });
          yield* fs.writeFile(`${directory}/source`, media);
          return yield* use(`${directory}/source`, directory);
        }),
      );

    const probeFile = (path: string) =>
      run(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration:stream=index,codec_type,codec_name",
          "-of",
          "json",
          path,
        ],
        PROBE_TIMEOUT,
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Probe)),
        Effect.flatMap(({ format, streams }) => {
          const durationSec = Number(format.duration);
          return Number.isFinite(durationSec) && durationSec > 0
            ? Effect.succeed({
                durationSec,
                hasAudio: streams.some((stream) => stream.codec_type === "audio"),
                hasVideo: streams.some((stream) => stream.codec_type === "video"),
                subtitleStreamIndex: streams.find(
                  (stream) =>
                    stream.codec_type === "subtitle" &&
                    ["mov_text", "subrip", "webvtt", "ass"].includes(stream.codec_name ?? ""),
                )?.index,
              })
            : Effect.fail("Missing media duration");
        }),
      );

    const probe = Effect.fn("MediaProcessor.probe")(
      function* (media: Uint8Array) {
        const { durationSec, hasVideo, subtitleStreamIndex } = yield* withFile(media, probeFile);
        return {
          durationSec,
          hasVideo,
          ...(subtitleStreamIndex === undefined ? {} : { subtitleStreamIndex }),
        };
      },
      Effect.mapError((cause) => new MediaError({ operation: "probe", cause })),
    );

    const embeddedCaptions = Effect.fn("MediaProcessor.embeddedCaptions")(
      function* (media: Uint8Array, streamIndex: number) {
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            const output = `${directory}/captions.vtt`;
            yield* run(
              "ffmpeg",
              [
                "-nostdin",
                "-loglevel",
                "error",
                "-y",
                "-i",
                path,
                "-map",
                `0:${streamIndex}`,
                "-c:s",
                "webvtt",
                output,
              ],
              CAPTIONS_TIMEOUT,
            );
            return new TextDecoder().decode(yield* fs.readFile(output));
          }),
        );
      },
      Effect.mapError((cause) => new MediaError({ operation: "captions", cause })),
    );

    const audioSegments = Effect.fn("MediaProcessor.audioSegments")(
      function* (
        media: Uint8Array,
        options: Parameters<MediaProcessor["Service"]["audioSegments"]>[1],
      ) {
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            const info = yield* probeFile(path);
            if (!info.hasAudio) return [];
            const duration = Math.min(info.durationSec, options.maxSec);
            const step = Math.max(1, options.segmentSec - options.overlapSec);
            const starts = Array.from(
              { length: Math.ceil(duration / step) },
              (_, index) => index * step,
            );
            return yield* Effect.forEach(starts, (start, index) => {
              const clip = `${directory}/audio-${index}.mp3`;
              const length = String(Math.min(options.segmentSec, duration - start));
              return run(
                "ffmpeg",
                [
                  "-nostdin",
                  "-loglevel",
                  "error",
                  "-y",
                  "-ss",
                  String(start),
                  "-i",
                  path,
                  "-t",
                  length,
                  "-vn",
                  "-ac",
                  "1",
                  "-ar",
                  "16000",
                  "-c:a",
                  "libmp3lame",
                  "-b:a",
                  "48k",
                  clip,
                ],
                SEGMENT_TIMEOUT,
              ).pipe(
                Effect.andThen(fs.readFile(clip)),
                Effect.map((bytes) => ({ offsetSec: start, bytes, mimeType: "audio/mpeg" })),
              );
            });
          }),
        );
      },
      Effect.mapError((cause) => new MediaError({ operation: "audio", cause })),
    );

    // One ffmpeg pass writes each selected frame twice: a JPEG for the vision model and
    // an 8×8 grayscale copy (appended to one raw file) for duplicate detection.
    const sceneFrames = Effect.fn("MediaProcessor.sceneFrames")(
      function* (media: Uint8Array, options: { readonly maxFrames: number }) {
        if (options.maxFrames <= 0) return [];
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            const select = `select='isnan(prev_selected_t)+gt(scene\\,0.3)+gte(t-prev_selected_t\\,${MAX_FRAME_GAP_SEC})'`;
            const log = yield* run(
              "ffmpeg",
              [
                "-nostdin",
                "-hide_banner",
                "-y",
                "-i",
                path,
                "-filter_complex",
                `[0:v]${select},showinfo,split=2[full][tiny];` +
                  "[full]scale=1280:1280:force_original_aspect_ratio=decrease[jpg];" +
                  "[tiny]scale=8:8,format=gray[hash]",
                "-map",
                "[jpg]",
                "-fps_mode",
                "vfr",
                "-q:v",
                "3",
                `${directory}/frame-%06d.jpg`,
                "-map",
                "[hash]",
                "-fps_mode",
                "vfr",
                "-f",
                "rawvideo",
                `${directory}/hashes.gray`,
              ],
              FRAMES_TIMEOUT,
            );
            const times = [...log.matchAll(/showinfo.*?pts_time:\s*([\d.]+)/g)].map(([, time]) =>
              Number(time),
            );
            const hashes = yield* fs.readFile(`${directory}/hashes.gray`);
            const frames = yield* Effect.forEach(times, (atSec, index) =>
              fs.readFile(`${directory}/frame-${String(index + 1).padStart(6, "0")}.jpg`).pipe(
                Effect.map((bytes) => ({
                  frame: { atSec, bytes, mimeType: "image/jpeg" },
                  hash: averageHash(
                    hashes.subarray(index * HASH_PIXELS, (index + 1) * HASH_PIXELS),
                  ),
                })),
              ),
            );
            return spread(distinctFrames(frames), options.maxFrames).map(({ frame }) => frame);
          }),
        );
      },
      Effect.mapError((cause) => new MediaError({ operation: "frames", cause })),
    );

    return MediaProcessor.of({ probe, embeddedCaptions, audioSegments, sceneFrames });
  }),
);
