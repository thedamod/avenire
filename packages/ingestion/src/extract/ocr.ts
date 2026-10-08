/** Optical character recognition for scanned PDF pages and images (Mistral OCR). */
import { generateText, Output } from "ai";
import * as Arr from "effect/Array";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { PDFDocument } from "pdf-lib";

import { INGESTION_RETRY, IngestionModels } from "../models.ts";

export class OcrError extends Schema.TaggedError<OcrError>()("OcrError", {
  pages: Schema.Number,
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `OCR of ${this.pages} page(s) failed`;
  }
}

export interface OcrPage {
  /** 1-based page number in the source document. */
  readonly page: number;
  /** Page text as Markdown, tables included, with figure descriptions inline. */
  readonly markdown: string;
}

export class Ocr extends Context.Service<
  Ocr,
  {
    readonly model: string;
    /** OCR of the given 1-based pages of a PDF (all pages when omitted). */
    readonly pdf: (
      bytes: Uint8Array,
      pages?: ReadonlyArray<number>,
    ) => Effect.Effect<ReadonlyArray<OcrPage>, OcrError>;
    readonly image: (bytes: Uint8Array, mimeType: string) => Effect.Effect<string, OcrError>;
  }
>()("avenire/ingestion/Ocr") {}

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PAGES_PER_REQUEST = 30;
const ENDPOINT = "https://api.mistral.ai/v1/ocr";

const OcrResponse = Schema.Struct({
  pages: Schema.Array(
    Schema.Struct({
      index: Schema.Number,
      markdown: Schema.String,
      images: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            image_annotation: Schema.optional(Schema.NullOr(Schema.String)),
          }),
        ),
      ),
    }),
  ),
});

const FigureAnnotation = Schema.fromJsonString(Schema.Struct({ short_description: Schema.String }));

const annotationFormat = {
  type: "json_schema",
  json_schema: {
    name: "figure_description",
    strict: true,
    schema: {
      type: "object",
      properties: {
        short_description: {
          type: "string",
          description:
            "Briefly describe the figure, chart, or image, including visible labels and data.",
        },
      },
      required: ["short_description"],
      additionalProperties: false,
    },
  },
};

/** Brief transient errors are retried; a persistent one moves on to the Gemini fallback. */
const RETRY = { schedule: Schedule.exponential("2 seconds"), times: 2 } as const;

const dataUrl = (bytes: Uint8Array, mimeType: string) =>
  `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;

/** A page's Markdown with its figure annotations appended as `Figure <id>: ...` lines. */
const pageMarkdown = (page: (typeof OcrResponse.Type)["pages"][number]) =>
  Effect.forEach(page.images ?? [], (image) =>
    image.image_annotation
      ? Schema.decodeUnknownEffect(FigureAnnotation)(image.image_annotation).pipe(
          Effect.map(({ short_description }) => `Figure ${image.id}: ${short_description}`),
          Effect.orElseSucceed(() => ""),
        )
      : Effect.succeed(""),
  ).pipe(Effect.map((figures) => [page.markdown, ...figures].filter(Boolean).join("\n\n").trim()));

/** Gemini reads PDFs inline up to this size; larger ones have no fallback. */
const MAX_FALLBACK_BYTES = 20 * 1024 * 1024;

const FallbackPages = Schema.Struct({
  pages: Schema.Array(Schema.Struct({ page: Schema.Int, markdown: Schema.String })),
});
const fallbackOutput = Output.object({
  schema: Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(FallbackPages)),
});
const FALLBACK_SYSTEM = [
  "You are an OCR engine. Transcribe the requested PDF pages to Markdown, one entry per page, with 1-based page numbers.",
  "Number pages by their order in the attached PDF, starting at 1; ignore printed page numbers.",
  "Keep tables as Markdown tables and equations as LaTeX. For each figure or chart, add a line `Figure: <what it shows, its labels and data>`.",
].join("\n");

/** PDF page order becomes 1..N for Gemini; its answers are mapped to source pages below. */
export const subsetPdfPages = async (bytes: Uint8Array, pages: ReadonlyArray<number>) => {
  const source = await PDFDocument.load(bytes);
  const subset = await PDFDocument.create();
  const copied = await subset.copyPages(
    source,
    pages.map((page) => page - 1),
  );
  for (const page of copied) subset.addPage(page);
  return subset.save();
};

/** Maps Gemini's 1-based subset page numbers back to the source PDF. */
export const remapFallbackPages = (
  recognized: ReadonlyArray<OcrPage>,
  originals: ReadonlyArray<number> | undefined,
): ReadonlyArray<OcrPage> =>
  recognized.flatMap(({ page, markdown }) => {
    const original = originals === undefined ? page : originals[page - 1];
    return original === undefined ? [] : [{ page: original, markdown }];
  });

/**
 * Mistral OCR, falling back to Gemini (which reads PDFs natively) when a request
 * still fails after retries, e.g. while the Mistral key is rate limited.
 */
export const OcrLive = Layer.effect(
  Ocr,
  Effect.gen(function* () {
    const models = yield* IngestionModels;
    const apiKey = yield* Config.Redacted("MISTRAL_API_KEY");
    const model = yield* Config.String("MISTRAL_OCR_MODEL").pipe(
      Config.withDefault("mistral-ocr-latest"),
    );
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient(RETRY),
      HttpClient.filterStatusOk,
    );

    /** One OCR request; `pages` are 1-based and at most `MAX_PAGES_PER_REQUEST`. */
    const request = (document: object, pages: ReadonlyArray<number> | undefined) =>
      HttpClientRequest.post(ENDPOINT).pipe(
        HttpClientRequest.bearerToken(Redacted.value(apiKey)),
        HttpClientRequest.bodyJson({
          model,
          document,
          ...(pages === undefined ? {} : { pages: pages.map((page) => page - 1) }),
          include_image_base64: false,
          bbox_annotation_format: annotationFormat,
        }),
        Effect.flatMap(client.execute),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(OcrResponse)),
        Effect.timeout("60 seconds"),
        Effect.flatMap(({ pages: results }) =>
          Effect.forEach(results, (page) =>
            Effect.map(pageMarkdown(page), (markdown) => ({ page: page.index + 1, markdown })),
          ),
        ),
        Effect.mapError((cause) => new OcrError({ pages: pages?.length ?? 1, cause })),
      );

    /** The given 1-based pages (all when omitted) of a PDF, transcribed by Gemini. */
    const fallback = (bytes: Uint8Array, pages: ReadonlyArray<number> | undefined) =>
      Effect.fn("Ocr.fallback")(function* () {
        const document =
          pages === undefined
            ? bytes
            : yield* Effect.tryPromise(() => subsetPdfPages(bytes, pages));
        if (document.byteLength > MAX_FALLBACK_BYTES) {
          return yield* Effect.fail("Too large for the fallback");
        }
        const { output } = yield* Effect.tryPromise((abortSignal) =>
          generateText({
            model: models.languageModel("ingest-vision"),
            output: fallbackOutput,
            system: FALLBACK_SYSTEM,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Transcribe every page of this PDF." },
                  { type: "file", data: document, mediaType: "application/pdf" },
                ],
              },
            ],
            abortSignal,
          }),
        ).pipe(Effect.timeout("3 minutes"), Effect.retry(INGESTION_RETRY));
        return remapFallbackPages(output.pages, pages);
      })().pipe(Effect.mapError((cause) => new OcrError({ pages: pages?.length ?? 1, cause })));

    const tooLarge = (bytes: Uint8Array, pages: number) =>
      bytes.byteLength > MAX_BYTES
        ? Effect.fail(new OcrError({ pages, cause: "Source exceeds 50 MiB" }))
        : Effect.void;

    const pdf = Effect.fn("Ocr.pdf")(function* (bytes: Uint8Array, pages?: ReadonlyArray<number>) {
      yield* tooLarge(bytes, pages?.length ?? 1);
      const document = { type: "document_url", document_url: dataUrl(bytes, "application/pdf") };
      const batches =
        pages === undefined ? [undefined] : Arr.chunksOf(pages, MAX_PAGES_PER_REQUEST);
      const results = yield* Effect.forEach(batches, (batch) =>
        request(document, batch).pipe(
          Effect.catchTags({
            OcrError: (error) =>
              Effect.logWarning("Mistral OCR failed; falling back to Gemini", error).pipe(
                Effect.andThen(fallback(bytes, batch)),
              ),
          }),
        ),
      );
      return results.flat();
    });

    const image = Effect.fn("Ocr.image")(function* (bytes: Uint8Array, mimeType: string) {
      yield* tooLarge(bytes, 1);
      const pages = yield* request(
        { type: "image_url", image_url: dataUrl(bytes, mimeType) },
        undefined,
      );
      return pages.map((page) => page.markdown).join("\n\n");
    });

    return Ocr.of({ model, pdf, image });
  }),
);

export const OcrTest = Layer.succeed(
  Ocr,
  Ocr.of({
    model: "test/empty",
    pdf: () => Effect.succeed([]),
    image: () => Effect.succeed(""),
  }),
);
