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

export type MediaSource =
  | Uint8Array
  | { readonly path: string; readonly directory: string; readonly sizeBytes: number };

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
    readonly streamsAudio?: boolean;
    readonly withSource?: <A, E, R>(
      media: MediaSource,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | MediaError, R>;
    /** Duration in seconds, and whether there is a video stream. */
    readonly probe: (media: MediaSource) => Effect.Effect<
      {
        readonly durationSec: number;
        readonly hasVideo: boolean;
        readonly subtitleStreamIndex?: number;
      },
      MediaError
    >;
    /** Converts the first supported subtitle stream to WebVTT. */
    readonly embeddedCaptions: (
      media: MediaSource,
      streamIndex: number,
    ) => Effect.Effect<string, MediaError>;
    /** Mono 16 kHz compressed audio in overlapping segments, up to `maxSec` of the source. */
    readonly audioSegments: (
      media: MediaSource,
      options: {
        readonly segmentSec: number;
        readonly overlapSec: number;
        readonly maxSec: number;
        readonly onSegment?: (clip: AudioSegment) => Effect.Effect<void>;
      },
    ) => Effect.Effect<ReadonlyArray<AudioSegment>, MediaError>;
    /** Bounded scene samples across up to six hours; near-duplicates dropped, at most `maxFrames`. */
    readonly sceneFrames: (
      media: MediaSource,
      options: { readonly maxFrames: number },
    ) => Effect.Effect<ReadonlyArray<Frame>, MediaError>;
  }
>()("avenire/ingestion/MediaProcessor") {}

const CurrentMedia = Context.Reference<
  | {
      bytes: MediaSource;
      path: string;
      directory: string;
      probe?: Effect.Effect<
        {
          durationSec: number;
          hasAudio: boolean;
          hasVideo: boolean;
          subtitleStreamIndex: number | undefined;
        },
        unknown
      >;
    }
  | undefined
>("avenire/ingestion/CurrentMedia", { defaultValue: () => undefined });

const Probe = Schema.fromJsonString(
  Schema.Struct({
    format: Schema.Struct({ duration: Schema.optional(Schema.String) }),
    streams: Schema.Array(
      Schema.Struct({
        index: Schema.Number,
        codec_type: Schema.String,
        codec_name: Schema.optionalKey(Schema.String),
        width: Schema.optionalKey(Schema.Number),
        height: Schema.optionalKey(Schema.Number),
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

/** Hard limits apply before decoding/output allocation, independently of caller limits. */
export const MEDIA_LIMITS = {
  sourceBytes: 500 * 1024 * 1024,
  durationSec: 24 * 3600,
  workSec: 6 * 3600,
  pixels: 4096 * 4096,
  dimension: 8192,
  frames: 120,
  frameBytes: 8 * 1024 * 1024,
  outputBytes: 1024 * 1024,
  captionBytes: 5 * 1024 * 1024,
} as const;

// Deny HTTP, concat, crypto, data and nested playlist protocols, even for local inputs.
export const LOCAL_INPUT = [
  "-protocol_whitelist",
  "file,pipe",
  "-threads",
  "1",
  "-max_pixels",
  String(MEDIA_LIMITS.pixels),
] as const;

/** Space scene candidates across the bounded timeline before JPEG/hash production. */
export const frameSelection = (durationSec: number, requested: number) => {
  const maxFrames = Math.min(MEDIA_LIMITS.frames, Math.max(1, Math.floor(requested)));
  const duration = Math.min(durationSec, MEDIA_LIMITS.workSec);
  const gap = duration / Math.max(1, maxFrames - 1);
  const fallback = Math.max(MAX_FRAME_GAP_SEC, gap * 1.5);
  return {
    maxFrames,
    duration,
    filter: `select='isnan(prev_selected_t)+gte(t-prev_selected_t,${gap})*(gt(scene,0.3)+gte(t-prev_selected_t,${fallback}))'`,
  };
};

/** Shared command builder lets local synthetic-media tests exercise the production bounds. */
export const sceneFrameArguments = (
  path: string,
  directory: string,
  { filter: select, duration, maxFrames }: ReturnType<typeof frameSelection>,
): ReadonlyArray<string> => [
  "-nostdin",
  "-hide_banner",
  "-filter_complex_threads",
  "1",
  "-y",
  ...LOCAL_INPUT,
  "-t",
  String(duration),
  "-i",
  path,
  "-filter_complex",
  `[0:v]${select},showinfo,split=2[full][tiny];` +
    "[full]scale=1280:1280:force_original_aspect_ratio=decrease[jpg];" +
    "[tiny]scale=8:8,format=gray[hash]",
  "-map",
  "[jpg]",
  "-frames:v",
  String(maxFrames),
  "-fs",
  String(MEDIA_LIMITS.frames * MEDIA_LIMITS.frameBytes),
  "-fps_mode",
  "vfr",
  "-q:v",
  "3",
  `${directory}/frame-%06d.jpg`,
  "-map",
  "[hash]",
  "-frames:v",
  String(maxFrames),
  "-fs",
  String(maxFrames * HASH_PIXELS),
  "-fps_mode",
  "vfr",
  "-f",
  "rawvideo",
  `${directory}/hashes.gray`,
];

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
          let outputBytes = 0;
          const handle = yield* spawner.spawn(
            ChildProcess.make(executable, args, { forceKillAfter: "1 second" }),
          );
          const [output, code] = yield* Effect.all(
            [
              Stream.mkString(
                Stream.decodeText(
                  (executable === "ffmpeg" ? handle.all : handle.stdout).pipe(
                    Stream.mapEffect((bytes) => {
                      outputBytes += bytes.length;
                      return outputBytes <= MEDIA_LIMITS.outputBytes
                        ? Effect.succeed(bytes)
                        : Effect.fail("Media subprocess output budget exceeded");
                    }),
                  ),
                ),
              ),
              handle.exitCode,
              executable === "ffprobe"
                ? handle.stderr.pipe(
                    Stream.mapEffect((bytes) => {
                      outputBytes += bytes.length;
                      return outputBytes <= MEDIA_LIMITS.outputBytes
                        ? Effect.void
                        : Effect.fail("Media subprocess output budget exceeded");
                    }),
                    Stream.runDrain,
                  )
                : Effect.void,
            ],
            { concurrency: 3 },
          );
          if (code !== 0) return yield* Effect.fail(`${executable} exited with code ${code}`);
          return output;
        }),
      ).pipe(Effect.timeout(timeout));

    /** Writes `media` to a scoped temp directory, which is removed afterwards. */
    const withFile = <A, E, R = never>(
      media: MediaSource,
      use: (path: string, directory: string) => Effect.Effect<A, E, R>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const current = yield* CurrentMedia;
          if (current?.bytes === media) return yield* use(current.path, current.directory);
          if (!(media instanceof Uint8Array)) {
            if (media.sizeBytes > MEDIA_LIMITS.sourceBytes)
              return yield* Effect.fail("Media source byte budget exceeded");
            return yield* use(media.path, media.directory);
          }
          if (media.length > MEDIA_LIMITS.sourceBytes)
            return yield* Effect.fail("Media source byte budget exceeded");
          const directory = yield* fs.makeTempDirectoryScoped({ prefix: "avenire-media-" });
          yield* fs.writeFile(`${directory}/source`, media);
          return yield* use(`${directory}/source`, directory);
        }),
      );

    // Check the producer's files before allocating buffers. The directory is private and
    // subprocesses have exited, so no writer can race this check.
    const readBounded = (path: string, maxBytes: number) =>
      Effect.gen(function* () {
        const info = yield* fs.stat(path);
        if (Number(info.size) > maxBytes)
          return yield* Effect.fail("Media output byte budget exceeded");
        const bytes = yield* fs.readFile(path);
        if (bytes.length > maxBytes) return yield* Effect.fail("Media output byte budget exceeded");
        return bytes;
      });

    const probeFileUncached = (path: string) =>
      run(
        "ffprobe",
        [
          "-v",
          "error",
          ...LOCAL_INPUT,
          "-show_entries",
          "format=duration:stream=index,codec_type,codec_name,width,height",
          "-of",
          "json",
          path,
        ],
        PROBE_TIMEOUT,
      ).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Probe)),
        Effect.flatMap(({ format, streams }) => {
          const durationSec = Number(format.duration);
          if (
            streams.some(
              (stream) =>
                stream.codec_type === "video" &&
                (!stream.width ||
                  !stream.height ||
                  stream.width > MEDIA_LIMITS.dimension ||
                  stream.height > MEDIA_LIMITS.dimension ||
                  stream.width * stream.height > MEDIA_LIMITS.pixels),
            )
          )
            return Effect.fail("Media pixel budget exceeded");
          return Number.isFinite(durationSec) &&
            durationSec > 0 &&
            durationSec <= MEDIA_LIMITS.durationSec
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

    const probeFile = (path: string) =>
      Effect.gen(function* () {
        const current = yield* CurrentMedia;
        return yield* current?.path === path && current.probe
          ? current.probe
          : probeFileUncached(path);
      });

    const probe = Effect.fn("MediaProcessor.probe")(
      function* (media: MediaSource) {
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
      function* (media: MediaSource, streamIndex: number) {
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            yield* probeFile(path);
            if (!Number.isSafeInteger(streamIndex) || streamIndex < 0)
              return yield* Effect.fail("Invalid subtitle stream");
            const output = `${directory}/captions.vtt`;
            yield* run(
              "ffmpeg",
              [
                "-nostdin",
                "-loglevel",
                "error",
                "-y",
                ...LOCAL_INPUT,
                "-i",
                path,
                "-map",
                `0:${streamIndex}`,
                "-t",
                String(MEDIA_LIMITS.workSec),
                "-fs",
                String(MEDIA_LIMITS.captionBytes),
                "-c:s",
                "webvtt",
                output,
              ],
              CAPTIONS_TIMEOUT,
            );
            const captionBytes = yield* readBounded(output, MEDIA_LIMITS.captionBytes);
            if (captionBytes.length >= MEDIA_LIMITS.captionBytes)
              return yield* Effect.fail("Caption byte budget exceeded");
            return new TextDecoder().decode(captionBytes);
          }),
        );
      },
      Effect.mapError((cause) => new MediaError({ operation: "captions", cause })),
    );

    const audioSegments = Effect.fn("MediaProcessor.audioSegments")(
      function* (
        media: MediaSource,
        options: Parameters<MediaProcessor["Service"]["audioSegments"]>[1],
      ) {
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            const info = yield* probeFile(path);
            if (!info.hasAudio) return [];
            if (
              ![options.segmentSec, options.overlapSec, options.maxSec].every(Number.isFinite) ||
              options.segmentSec <= 0 ||
              options.segmentSec > 600 ||
              options.overlapSec < 0 ||
              options.overlapSec >= options.segmentSec ||
              options.maxSec <= 0
            )
              return yield* Effect.fail("Invalid audio segment budget");
            const duration = Math.min(info.durationSec, options.maxSec, MEDIA_LIMITS.workSec);
            const step = Math.max(1, options.segmentSec - options.overlapSec);
            const starts = Array.from(
              { length: Math.ceil(duration / step) },
              (_, index) => index * step,
            );
            if (starts.length > 128)
              return yield* Effect.fail("Audio segment count budget exceeded");
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
                  ...LOCAL_INPUT,
                  "-i",
                  path,
                  "-t",
                  length,
                  "-fs",
                  String(8 * 1024 * 1024),
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
                Effect.andThen(readBounded(clip, 8 * 1024 * 1024)),
                Effect.flatMap((bytes) =>
                  fs.remove(clip).pipe(
                    Effect.andThen(
                      bytes.length >= 8 * 1024 * 1024
                        ? Effect.fail("Audio clip byte budget exceeded")
                        : Effect.succeed({ offsetSec: start, bytes, mimeType: "audio/mpeg" }).pipe(
                            Effect.tap((segment) => options.onSegment?.(segment) ?? Effect.void),
                            Effect.map((segment) =>
                              options.onSegment
                                ? { ...segment, bytes: new Uint8Array(0) }
                                : segment,
                            ),
                          ),
                    ),
                  ),
                ),
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
      function* (media: MediaSource, options: { readonly maxFrames: number }) {
        if (!Number.isFinite(options.maxFrames))
          return yield* Effect.fail(
            new MediaError({ operation: "frames", cause: "Invalid frame budget" }),
          );
        if (options.maxFrames <= 0) return [];
        return yield* withFile(media, (path, directory) =>
          Effect.gen(function* () {
            const info = yield* probeFile(path);
            if (!info.hasVideo) return [];
            const {
              filter: select,
              duration,
              maxFrames,
            } = frameSelection(info.durationSec, options.maxFrames);
            const log = yield* run(
              "ffmpeg",
              sceneFrameArguments(path, directory, { filter: select, duration, maxFrames }),
              FRAMES_TIMEOUT,
            );
            const times = [...log.matchAll(/showinfo.*?pts_time:\s*([\d.]+)/g)].map(([, time]) =>
              Number(time),
            );
            if (times.length > maxFrames)
              return yield* Effect.fail("Frame production budget exceeded");
            const hashes = yield* readBounded(`${directory}/hashes.gray`, maxFrames * HASH_PIXELS);
            if (hashes.length !== times.length * HASH_PIXELS)
              return yield* Effect.fail("Frame hash count does not match produced frames");
            const frames = yield* Effect.forEach(times, (atSec, index) =>
              readBounded(
                `${directory}/frame-${String(index + 1).padStart(6, "0")}.jpg`,
                MEDIA_LIMITS.frameBytes,
              ).pipe(
                Effect.flatMap((bytes) =>
                  bytes.length > MEDIA_LIMITS.frameBytes
                    ? Effect.fail("JPEG byte budget exceeded")
                    : Effect.succeed({
                        frame: { atSec, bytes, mimeType: "image/jpeg" },
                        hash: averageHash(
                          hashes.subarray(index * HASH_PIXELS, (index + 1) * HASH_PIXELS),
                        ),
                      }),
                ),
              ),
            );
            return distinctFrames(frames).map(({ frame }) => frame);
          }),
        );
      },
      Effect.mapError((cause) => new MediaError({ operation: "frames", cause })),
    );

    const withSource = <A, E, R>(bytes: MediaSource, effect: Effect.Effect<A, E, R>) =>
      withFile(bytes, (path, directory) =>
        Effect.gen(function* () {
          const probe = yield* Effect.cached(probeFileUncached(path));
          return yield* effect.pipe(
            Effect.provideService(CurrentMedia, { bytes, path, directory, probe }),
          );
        }),
      ).pipe(
        Effect.mapError((cause) =>
          cause instanceof MediaError ? cause : new MediaError({ operation: "probe", cause }),
        ),
      );
    return MediaProcessor.of({
      probe,
      embeddedCaptions,
      audioSegments,
      sceneFrames,
      withSource,
      streamsAudio: true,
    });
  }),
);
