/** Optical character recognition for scanned PDF pages and images (Mistral OCR). */
import * as Arr from "effect/Array";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { PDFDocument } from "pdf-lib";

export class OcrError extends Schema.TaggedError<OcrError>()("OcrError", {
  pages: Schema.Number,
  status: Schema.optionalKey(Schema.Number),
  cause: Schema.Defect(),
}) {
  override get message(): string {
    return `OCR of ${this.pages} page(s) failed${this.status ? ` (HTTP ${this.status})` : ""}`;
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

/** Retry transient Mistral errors; the ingestion queue handles longer outages. */
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

/** Send only the requested pages, with source page numbers restored after OCR. */
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

/** Maps the OCR subset page numbers back to the source PDF. */
export const remapOcrPages = (
  recognized: ReadonlyArray<OcrPage>,
  originals: ReadonlyArray<number> | undefined,
): ReadonlyArray<OcrPage> =>
  recognized.flatMap(({ page, markdown }) => {
    const original = originals === undefined ? page : originals[page - 1];
    return original === undefined ? [] : [{ page: original, markdown }];
  });

/** Split an oversized OCR request while preserving source page order. */
export const splitOcrPages = (
  pages: ReadonlyArray<number>,
): readonly [ReadonlyArray<number>, ReadonlyArray<number>] | null => {
  if (pages.length < 2) return null;
  const middle = Math.floor(pages.length / 2);
  return [pages.slice(0, middle), pages.slice(middle)];
};

/** Mistral OCR for PDFs and images, with bounded page batches and no cross-provider fallback. */
export const OcrLive = Layer.effect(
  Ocr,
  Effect.gen(function* () {
    const apiKey = yield* Config.Redacted("MISTRAL_API_KEY");
    const model = yield* Config.String("MISTRAL_OCR_MODEL").pipe(
      Config.withDefault("mistral-ocr-latest"),
    );
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.retryTransient(RETRY),
      HttpClient.filterStatusOk,
    );

    /** One OCR request; `pages` are 1-based and at most `MAX_PAGES_PER_REQUEST`. */
    const request = (document: object, pageCount: number) =>
      HttpClientRequest.post(ENDPOINT).pipe(
        HttpClientRequest.bearerToken(Redacted.value(apiKey)),
        HttpClientRequest.bodyJson({
          model,
          document,
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
        Effect.mapError(
          (cause) =>
            new OcrError({
              pages: pageCount,
              ...(HttpClientError.isHttpClientError(cause) &&
              cause.reason._tag === "StatusCodeError"
                ? { status: cause.reason.response.status }
                : {}),
              cause,
            }),
        ),
      );

    const tooLarge = (bytes: Uint8Array, pages: number) =>
      bytes.byteLength > MAX_BYTES
        ? Effect.fail(new OcrError({ pages, cause: "Source exceeds 50 MiB" }))
        : Effect.void;

    const pdfBatch = (
      bytes: Uint8Array,
      pages: ReadonlyArray<number> | undefined,
    ): Effect.Effect<ReadonlyArray<OcrPage>, OcrError> =>
      Effect.gen(function* () {
        const document =
          pages === undefined
            ? bytes
            : yield* Effect.tryPromise({
                try: () => subsetPdfPages(bytes, pages),
                catch: (cause) => new OcrError({ pages: pages.length, cause }),
              });
        if (document.byteLength > MAX_BYTES && pages && pages.length > 1) {
          const halves = splitOcrPages(pages)!;
          const results = yield* Effect.forEach(halves, (half) => pdfBatch(bytes, half));
          return results.flat();
        }
        yield* tooLarge(document, pages?.length ?? 1);
        const recognized = yield* request(
          { type: "document_url", document_url: dataUrl(document, "application/pdf") },
          pages?.length ?? 1,
        );
        return remapOcrPages(recognized, pages);
      });

    const pdf = Effect.fn("Ocr.pdf")(function* (bytes: Uint8Array, pages?: ReadonlyArray<number>) {
      const batches =
        pages === undefined ? [undefined] : Arr.chunksOf(pages, MAX_PAGES_PER_REQUEST);
      const results = yield* Effect.forEach(batches, (batch) => pdfBatch(bytes, batch));
      return results.flat();
    });

    const image = Effect.fn("Ocr.image")(function* (bytes: Uint8Array, mimeType: string) {
      yield* tooLarge(bytes, 1);
      const pages = yield* request({ type: "image_url", image_url: dataUrl(bytes, mimeType) }, 1);
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
