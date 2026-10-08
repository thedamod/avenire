/** Describes images and video frames for search (a vision model via the AI SDK). */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { generateText, Output } from "ai";

import { INGESTION_RETRY, IngestionModels } from "../models.ts";

const DescriptionSchema = Schema.Struct({ description: Schema.String, text: Schema.String });
const descriptionOutput = Output.object({
  schema: Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(DescriptionSchema)),
});

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

const SYSTEM = [
  "Describe what a student would search for: diagram type, labelled parts, what a chart shows, axes and trends.",
  "Transcribe all visible text verbatim, equations as LaTeX. Use empty strings when there is no text or nothing to describe.",
].join("\n");

export const ImageDescriberLive = Layer.effect(
  ImageDescriber,
  Effect.gen(function* () {
    const models = yield* IngestionModels;
    return ImageDescriber.of({
      describe: Effect.fn("ImageDescriber.describe")(function* (input) {
        const result = yield* Effect.tryPromise((abortSignal) =>
          generateText({
            model: models.languageModel("ingest-vision"),
            output: descriptionOutput,
            system: SYSTEM,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: input.context ?? "Describe this image for search." },
                  { type: "file", data: input.image, mediaType: input.mimeType },
                ],
              },
            ],
            abortSignal,
          }),
        ).pipe(
          Effect.timeout("60 seconds"),
          Effect.retry(INGESTION_RETRY),
          Effect.mapError((cause) => new DescribeError({ cause })),
        );
        return result.output;
      }),
    });
  }),
);

export const ImageDescriberTest = Layer.succeed(
  ImageDescriber,
  ImageDescriber.of({
    describe: () =>
      Effect.succeed({ description: "test image description", text: "test visible text" }),
  }),
);
