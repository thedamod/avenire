import * as Effect from "effect/Effect";

import type { ImageDescriber } from "./describe.ts";
import type { Ocr } from "./ocr.ts";
import {
  type ExtractedDocument,
  type ExtractionError,
  type SourceInput,
  UnsupportedSource,
} from "./types.ts";

/** An image as a `figure` section: its description plus the text visible in it. */
export const extractImage = (
  _bytes: Uint8Array,
  source: SourceInput,
): Effect.Effect<ExtractedDocument, ExtractionError | UnsupportedSource, ImageDescriber | Ocr> =>
  Effect.fail(
    new UnsupportedSource({ kind: source.kind, reason: "Image extraction is not built yet" }),
  );
