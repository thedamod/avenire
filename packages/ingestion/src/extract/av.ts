import * as Effect from "effect/Effect";

import type { ImageDescriber } from "./describe.ts";
import type { MediaProcessor } from "./media.ts";
import type { Transcriber } from "./transcribe.ts";
import {
  type ExtractedDocument,
  type ExtractionError,
  type SourceInput,
  UnsupportedSource,
} from "./types.ts";

/** Audio or video: timed transcript sections, plus `slide` sections for video frames. */
export const extractMedia = (
  _bytes: Uint8Array,
  source: SourceInput,
): Effect.Effect<
  ExtractedDocument,
  ExtractionError | UnsupportedSource,
  MediaProcessor | Transcriber | ImageDescriber
> =>
  Effect.fail(
    new UnsupportedSource({ kind: source.kind, reason: "Media extraction is not built yet" }),
  );
