/** Describes images and video frames for search (a vision model via the AI SDK). */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class DescribeError extends Schema.TaggedError<DescribeError>()("DescribeError", {
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return "Describing the image failed";
  }
}

export interface ImageDescription {
  /** What the image shows, in the terms a student would search for. */
  readonly description: string;
  /** Text visible in the image (labels, equations, slide text), verbatim. */
  readonly text: string;
}

export class ImageDescriber extends Context.Service<
  ImageDescriber,
  {
    readonly describe: (input: {
      readonly image: Uint8Array;
      readonly mimeType: string;
      /** Title and nearby text, so the model can name what it sees. */
      readonly context?: string;
    }) => Effect.Effect<ImageDescription, DescribeError>;
  }
>()("avenire/ingestion/ImageDescriber") {}
