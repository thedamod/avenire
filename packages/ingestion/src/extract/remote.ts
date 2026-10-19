/** Platform metadata, subtitles and audio acquired with yt-dlp. */
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { acquireBytes, publicUrl, startPublicProxy } from "./acquisition.ts";

export class RemoteMediaError extends Schema.TaggedError<RemoteMediaError>()("RemoteMediaError", {
  operation: Schema.Literals(["metadata", "captions", "audio"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Remote media ${this.operation} failed`;
  }
}

const CaptionTrack = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  ext: Schema.optionalKey(Schema.String),
});
const DownloadFormat = Schema.Struct({
  url: Schema.optionalKey(Schema.String),
  protocol: Schema.optionalKey(Schema.String),
  acodec: Schema.optionalKey(Schema.String),
  vcodec: Schema.optionalKey(Schema.String),
});

const Chapter = Schema.Struct({
  title: Schema.String,
  start_time: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  end_time: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
const MetadataJson = Schema.fromJsonString(
  Schema.Struct({
    title: Schema.optionalKey(Schema.NullOr(Schema.String)),
    duration: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    uploader: Schema.optionalKey(Schema.NullOr(Schema.String)),
    channel: Schema.optionalKey(Schema.NullOr(Schema.String)),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    chapters: Schema.optionalKey(Schema.NullOr(Schema.Array(Chapter))),
    subtitles: Schema.optionalKey(
      Schema.NullOr(Schema.Record(Schema.String, Schema.Array(CaptionTrack))),
    ),
    formats: Schema.optionalKey(Schema.Array(DownloadFormat)),
    url: Schema.optionalKey(Schema.String),
    protocol: Schema.optionalKey(Schema.String),
    automatic_captions: Schema.optionalKey(
      Schema.NullOr(Schema.Record(Schema.String, Schema.Array(CaptionTrack))),
    ),
  }),
);

export interface RemoteMetadata {
  readonly title?: string;
  readonly durationSec?: number;
  readonly uploader?: string;
  readonly description?: string;
  readonly chapters: ReadonlyArray<{
    readonly title: string;
    readonly startSec: number;
    readonly endSec: number;
  }>;
  readonly subtitleLanguages: ReadonlyArray<string>;
  readonly automaticCaptionLanguages: ReadonlyArray<string>;
  /** Direct HTTP(S) downloads only; never hand remote inputs to ffmpeg. */
  readonly audioUrl?: string;
  readonly captionTracks?: ReadonlyArray<{
    readonly language: string;
    readonly kind: RemoteCaptions["kind"];
    readonly url: string;
  }>;
}

export interface RemoteCaptions {
  readonly text: string;
  readonly kind: "platform captions" | "auto captions";
  readonly language: string;
}

export class RemoteMedia extends Context.Service<
  RemoteMedia,
  {
    readonly metadata: (url: string) => Effect.Effect<RemoteMetadata, RemoteMediaError>;
    readonly captions: (
      url: string,
      metadata: RemoteMetadata,
      languages: ReadonlyArray<string>,
    ) => Effect.Effect<RemoteCaptions | undefined, RemoteMediaError>;
    readonly audio: (url: string, maxBytes: number) => Effect.Effect<Uint8Array, RemoteMediaError>;
  }
>()("avenire/ingestion/RemoteMedia") {}

/** Normalizes only the fields the extractor needs from yt-dlp's large JSON result. */
export const decodeRemoteMetadata = (json: string) =>
  Schema.decodeUnknownEffect(MetadataJson)(json).pipe(
    Effect.map((value): RemoteMetadata => {
      const uploader = value.channel ?? value.uploader;
      const formats = (value.formats ?? [value]).filter(
        (format) =>
          format.url !== undefined &&
          /^https?:\/\//i.test(format.url) &&
          (format.protocol === "http" || format.protocol === "https") &&
          (!("acodec" in format) || format.acodec !== "none"),
      );
      const audioUrl =
        formats.filter((format) => "vcodec" in format && format.vcodec === "none").at(-1)?.url ??
        formats.at(-1)?.url;
      const captionTracks = [
        ...Object.entries(value.subtitles ?? {}).map(([language, tracks]) => ({
          language,
          tracks,
          kind: "platform captions" as const,
        })),
        ...Object.entries(value.automatic_captions ?? {}).map(([language, tracks]) => ({
          language,
          tracks,
          kind: "auto captions" as const,
        })),
      ].flatMap(({ language, tracks, kind }) => {
        const track = tracks.find((track) => track.ext === "vtt" && track.url);
        return track?.url ? [{ language, kind, url: track.url }] : [];
      });
      return {
        ...(value.title ? { title: value.title } : {}),
        ...(value.duration !== undefined && value.duration !== null
          ? { durationSec: value.duration }
          : {}),
        ...(uploader ? { uploader } : {}),
        ...(value.description ? { description: value.description } : {}),
        chapters: (value.chapters ?? []).flatMap((chapter) =>
          chapter.start_time === undefined || chapter.start_time === null
            ? []
            : [
                {
                  title: chapter.title,
                  startSec: chapter.start_time,
                  endSec: chapter.end_time ?? chapter.start_time,
                },
              ],
        ),
        subtitleLanguages: Object.keys(value.subtitles ?? {}),
        automaticCaptionLanguages: Object.keys(value.automatic_captions ?? {}),
        ...(audioUrl ? { audioUrl } : {}),
        ...(captionTracks.length ? { captionTracks } : {}),
      };
    }),
  );

/** Manual subtitles win over automatic captions within the requested language order. */
export const preferredCaptions = (
  metadata: RemoteMetadata,
  languages: ReadonlyArray<string>,
): { readonly language: string; readonly kind: RemoteCaptions["kind"] } | undefined => {
  for (const language of languages) {
    const manual = metadata.subtitleLanguages.find((available) => available === language);
    if (manual) return { language: manual, kind: "platform captions" };
    const auto = metadata.automaticCaptionLanguages.find((available) => available === language);
    if (auto) return { language: auto, kind: "auto captions" };
  }
  return undefined;
};

/** Metadata discovery only. Downloaded bytes always pass through acquireBytes. */
const METADATA_TIMEOUT_MS = 45_000;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_CAPTION_BYTES = 5 * 1024 * 1024;

/** Ignore ambient executable/configuration hooks and never spawn an external downloader. */
export const metadataArguments = (url: string, proxy: string): ReadonlyArray<string> => [
  "--ignore-config",
  "--no-config-locations",
  "--no-plugin-dirs",
  "--no-js-runtimes",
  "--no-remote-components",
  "--no-cache-dir",
  "--no-playlist",
  "--no-warnings",
  "--socket-timeout",
  "15",
  "--retries",
  "1",
  "--extractor-retries",
  "1",
  "--proxy",
  proxy,
  "--geo-verification-proxy",
  proxy,
  "--downloader",
  "native",
  "--skip-download",
  "-J",
  "--",
  url,
];

const collectOutput = (stream: Stream.Stream<Uint8Array, unknown>) => {
  let size = 0;
  return stream.pipe(
    Stream.mapEffect((bytes) => {
      size += bytes.length;
      return size <= MAX_METADATA_BYTES
        ? Effect.succeed(bytes)
        : Effect.fail(
            new RemoteMediaError({
              operation: "metadata",
              cause: "Metadata output limit exceeded",
            }),
          );
    }),
    Stream.decodeText,
    Stream.mkString,
  );
};

export const RemoteMediaLive = Layer.effect(
  RemoteMedia,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const path = yield* Config.String("PATH").pipe(
      Config.withDefault("/usr/local/bin:/usr/bin:/bin"),
    );
    const metadata = Effect.fn("RemoteMedia.metadata")(
      function* (url: string) {
        yield* Effect.try({
          try: () => publicUrl(url),
          catch: (cause) => new RemoteMediaError({ operation: "metadata", cause }),
        });
        const output = yield* Effect.scoped(
          Effect.gen(function* () {
            const proxy = yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () => startPublicProxy({ timeoutMs: METADATA_TIMEOUT_MS }),
                catch: (cause) => new RemoteMediaError({ operation: "metadata", cause }),
              }),
              (proxy) => Effect.promise(() => proxy.close()),
            );
            const handle = yield* spawner.spawn(
              ChildProcess.make("yt-dlp", metadataArguments(url, proxy.url), {
                env: { PATH: path, LANG: "C.UTF-8", PYTHONNOUSERSITE: "1" },
                extendEnv: false,
                forceKillAfter: "1 second",
              }),
            );
            const [stdout, stderr, code] = yield* Effect.all(
              [collectOutput(handle.stdout), collectOutput(handle.stderr), handle.exitCode],
              { concurrency: 3 },
            );
            const denied = proxy.failure();
            if (denied) return yield* Effect.fail(denied);
            if (code !== 0)
              return yield* Effect.fail(
                new RemoteMediaError({
                  operation: "metadata",
                  cause: `yt-dlp exited with code ${code}: ${stderr.slice(-500)}`,
                }),
              );
            return stdout;
          }),
        ).pipe(Effect.timeout(METADATA_TIMEOUT_MS));
        return yield* decodeRemoteMetadata(output);
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "metadata", cause })),
    );
    const captions = Effect.fn("RemoteMedia.captions")(
      function* (_url: string, info: RemoteMetadata, languages: ReadonlyArray<string>) {
        const selected = preferredCaptions(info, languages);
        if (!selected) return undefined;
        const track = info.captionTracks?.find(
          (track) => track.language === selected.language && track.kind === selected.kind,
        );
        if (!track) return undefined;
        const bytes = yield* acquireBytes(track.url, {
          maxBytes: MAX_CAPTION_BYTES,
          timeoutMs: 30_000,
        });
        return { text: new TextDecoder().decode(bytes), ...selected };
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "captions", cause })),
    );
    const audio = Effect.fn("RemoteMedia.audio")(
      function* (url: string, maxBytes: number) {
        const info = yield* metadata(url);
        if (!info.audioUrl)
          return yield* Effect.fail(
            new RemoteMediaError({
              operation: "audio",
              cause:
                "No bounded direct HTTP(S) audio format is available; HLS/DASH-only sources and external downloads are unsupported",
            }),
          );
        return yield* acquireBytes(info.audioUrl, {
          maxBytes: Math.min(maxBytes, 500 * 1024 * 1024),
          timeoutMs: 20 * 60_000,
        });
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "audio", cause })),
    );
    return RemoteMedia.of({ metadata, captions, audio });
  }),
);
