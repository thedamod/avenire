/** Platform metadata, subtitles and audio acquired with yt-dlp. */
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

export class RemoteMediaError extends Schema.TaggedError<RemoteMediaError>()("RemoteMediaError", {
  operation: Schema.Literals(["metadata", "captions", "audio"]),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `Remote media ${this.operation} failed`;
  }
}

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
    subtitles: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown))),
    automatic_captions: Schema.optionalKey(
      Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
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

/** Every yt-dlp invocation has a wall-clock bound. */
const METADATA_TIMEOUT: Duration.Input = "45 seconds";
const CAPTIONS_TIMEOUT: Duration.Input = "2 minutes";
const AUDIO_TIMEOUT: Duration.Input = "20 minutes";

export const RemoteMediaLive = Layer.effect(
  RemoteMedia,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const run = (args: ReadonlyArray<string>, timeout: Duration.Input) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(ChildProcess.make("yt-dlp", args));
          const [stdout, stderr, code] = yield* Effect.all(
            [
              Stream.mkString(Stream.decodeText(handle.stdout)),
              Stream.mkString(Stream.decodeText(handle.stderr)),
              handle.exitCode,
            ],
            { concurrency: 3 },
          );
          if (code !== 0)
            return yield* Effect.fail(`yt-dlp exited with code ${code}: ${stderr.slice(-500)}`);
          return stdout;
        }),
      ).pipe(Effect.timeout(timeout));

    const metadata = Effect.fn("RemoteMedia.metadata")(
      function* (url: string) {
        const output = yield* run(["-J", "--no-playlist", "--no-warnings", url], METADATA_TIMEOUT);
        return yield* decodeRemoteMetadata(output);
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "metadata", cause })),
    );

    const captions = Effect.fn("RemoteMedia.captions")(
      function* (url: string, info: RemoteMetadata, languages: ReadonlyArray<string>) {
        const selected = preferredCaptions(info, languages);
        if (!selected) return undefined;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const directory = yield* fs.makeTempDirectoryScoped({ prefix: "avenire-remote-" });
            yield* run(
              [
                "--no-playlist",
                "--no-warnings",
                "--skip-download",
                "--write-subs",
                "--write-auto-subs",
                "--sub-format",
                "vtt",
                "--sub-langs",
                selected.language,
                "-o",
                `${directory}/captions.%(ext)s`,
                url,
              ],
              CAPTIONS_TIMEOUT,
            );
            const files = yield* fs.readDirectory(directory);
            const file = files.find((name) => name.endsWith(".vtt"));
            if (!file) return undefined;
            const bytes = yield* fs.readFile(`${directory}/${file}`);
            return { text: new TextDecoder().decode(bytes), ...selected };
          }),
        );
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "captions", cause })),
    );

    const audio = Effect.fn("RemoteMedia.audio")(
      function* (url: string, maxBytes: number) {
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const directory = yield* fs.makeTempDirectoryScoped({ prefix: "avenire-remote-" });
            yield* run(
              [
                "--no-playlist",
                "--no-warnings",
                "--no-progress",
                "--max-filesize",
                String(maxBytes),
                "-f",
                "bestaudio/best",
                "-o",
                `${directory}/audio.%(ext)s`,
                url,
              ],
              AUDIO_TIMEOUT,
            );
            const files = yield* fs.readDirectory(directory);
            const file = files.find((name) => name.startsWith("audio.") && !name.endsWith(".part"));
            if (!file) return yield* Effect.fail("yt-dlp did not produce an audio file");
            const bytes = yield* fs.readFile(`${directory}/${file}`);
            if (bytes.length > maxBytes)
              return yield* Effect.fail("Audio exceeds the download limit");
            return bytes;
          }),
        );
      },
      Effect.mapError((cause) => new RemoteMediaError({ operation: "audio", cause })),
    );

    return RemoteMedia.of({ metadata, captions, audio });
  }),
);
