import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { PDFDocument } from "pdf-lib";
import { Ocr, OcrLive } from "./ocr.ts";

const config = ConfigProvider.fromUnknown({ MISTRAL_API_KEY: "test" });
const withOcr = <A, E>(program: Effect.Effect<A, E, Ocr>, fetch: typeof globalThis.fetch) =>
  program.pipe(
    Effect.provide(OcrLive),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
    Effect.provideService(ConfigProvider.ConfigProvider, config),
  );

describe("Mistral OCR", () => {
  it.effect("reports a rejected key once and never calls another provider", () => {
    const urls: string[] = [];
    return withOcr(
      Effect.gen(function* () {
        const ocr = yield* Ocr;
        const error = yield* Effect.flip(ocr.image(new Uint8Array([1]), "image/png"));
        expect(error.status).toBe(401);
        expect(error.message).toContain("HTTP 401");
        expect(urls).toEqual(["https://api.mistral.ai/v1/ocr"]);
      }),
      async (url) => {
        urls.push(String(url));
        return new Response('{"message":"invalid key"}', { status: 401 });
      },
    );
  });

  it.effect("sends only requested PDF pages and maps annotations back to source pages", () => {
    let payload: Record<string, unknown> = {};
    return withOcr(
      Effect.gen(function* () {
        const source = yield* Effect.promise(async () => {
          const pdf = await PDFDocument.create();
          pdf.addPage([300, 400]);
          pdf.addPage([310, 400]);
          pdf.addPage([320, 400]);
          return pdf.save();
        });
        const ocr = yield* Ocr;
        const result = yield* ocr.pdf(source, [3, 1]);
        expect(result).toEqual([
          { page: 3, markdown: "Third page\n\nFigure chart: A trend" },
          { page: 1, markdown: "First page" },
        ]);
        expect(payload.model).toBe("mistral-ocr-latest");
        const document = payload.document as { document_url: string };
        const sent = yield* Effect.promise(() =>
          PDFDocument.load(Buffer.from(document.document_url.split(",")[1]!, "base64")),
        );
        expect(sent.getPageCount()).toBe(2);
        expect(sent.getPages().map((page) => page.getWidth())).toEqual([320, 300]);
      }),
      async (_url, init) => {
        payload = JSON.parse(String(init?.body));
        return Response.json({
          pages: [
            {
              index: 0,
              markdown: "Third page",
              images: [{ id: "chart", image_annotation: '{"short_description":"A trend"}' }],
            },
            { index: 1, markdown: "First page" },
          ],
        });
      },
    );
  });
});
