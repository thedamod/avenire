/** Speech to text with timestamps (Whisper via the AI SDK). */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class TranscriptionError extends Schema.TaggedError<TranscriptionError>()(
  "TranscriptionError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Transcription failed";
  }
}

export interface TranscriptSegment {
  readonly text: string;
  readonly startSec: number;
  readonly endSec: number;
}

export class Transcriber extends Context.Service<
  Transcriber,
  {
    readonly model: string;
    /** Segments of one audio clip, timed relative to the clip's start. */
    readonly transcribe: (
      audio: Uint8Array,
      mimeType: string,
    ) => Effect.Effect<ReadonlyArray<TranscriptSegment>, TranscriptionError>;
  }
>()("avenire/ingestion/Transcriber") {}
