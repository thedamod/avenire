/** Speech to text with timestamps (Whisper via the AI SDK). */
import * as Context from "effect/Context";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { INGESTION_RETRY } from "../models.ts";
import { createGroq } from "@ai-sdk/groq";
import { transcribe } from "ai";

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

/** One clip is at most ten minutes of audio. */
const TIMEOUT = "2 minutes";

export const TranscriberLive = Layer.effect(
  Transcriber,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("GROQ_API_KEY");
    const model = yield* Config.String("GROQ_TRANSCRIPTION_MODEL").pipe(
      Config.withDefault("whisper-large-v3-turbo"),
    );
    const groq = createGroq({ apiKey: Redacted.value(apiKey) });
    return Transcriber.of({
      model,
      transcribe: Effect.fn("Transcriber.transcribe")(
        function* (audio: Uint8Array) {
          const result = yield* Effect.tryPromise((abortSignal) =>
            transcribe({
              model: groq.transcription(model),
              audio,
              abortSignal,
              providerOptions: {
                groq: { responseFormat: "verbose_json", timestampGranularities: ["segment"] },
              },
            }),
          ).pipe(Effect.timeout(TIMEOUT), Effect.retry(INGESTION_RETRY));
          // Untimed text can't be placed on the timeline; treat it as a failed clip.
          if (result.segments.length === 0 && result.text.trim()) {
            return yield* Effect.fail("Transcript has no timed segments");
          }
          return result.segments.map((segment) => ({
            text: segment.text,
            startSec: segment.startSecond,
            endSec: segment.endSecond,
          }));
        },
        Effect.mapError((cause) => new TranscriptionError({ cause })),
      ),
    });
  }),
);

export const TranscriberTest = Layer.succeed(
  Transcriber,
  Transcriber.of({
    model: "test",
    transcribe: () => Effect.succeed([{ text: "test transcript", startSec: 0, endSec: 1 }]),
  }),
);
