/** ffmpeg/ffprobe work on audio and video files: probing, audio segments, slide frames. */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class MediaError extends Schema.TaggedError<MediaError>()("MediaError", {
  operation: Schema.Literals(["probe", "audio", "frames"]),
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
    readonly probe: (
      media: Uint8Array,
    ) => Effect.Effect<{ readonly durationSec: number; readonly hasVideo: boolean }, MediaError>;
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
