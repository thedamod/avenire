import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

import { pageHasFigure } from "./pdf-figures.ts";
import { sectionsFromMarkdown } from "./markdown.ts";
import { Ocr, type OcrPage } from "./ocr.ts";
import {
  type ExtractedDocument,
  type ExtractedSection,
  ExtractionError,
  combineCoverage,
} from "./types.ts";

const MIN_NATIVE_CHARS = 200;
const MAX_OCR_PAGES = 150;
const OCR_BATCH_SIZE = 30;
export interface NativePdfPage {
  readonly page: number;
  readonly text: string;
  readonly hasFigure: boolean;
}

export const pageNeedsOcr = (page: NativePdfPage): boolean =>
  page.text.trim().length < MIN_NATIVE_CHARS || page.hasFigure;

/** Keep native content when it is longer while adding OCR's tables and figure captions. */
export const mergePageText = (native: string, ocr: string): string => {
  const original = native.trim();
  const recognized = ocr.trim();
  if (!recognized) return original;
  if (recognized.length >= original.length) return recognized;
  const additions = recognized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\||^<table\b|^<tr\b|^Figure\b|^Fig\.?\s|^Table\b/i.test(line))
    .filter((line) => !original.includes(line));
  return [original, ...additions].filter(Boolean).join("\n\n");
};

const figureSections = (markdown: string, page: number): ReadonlyArray<ExtractedSection> =>
  markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^Figure\s+[^:]+:\s*\S/i.test(line))
    .map((text) => ({ text, location: { page }, kind: "figure" }));

/** Builds page, heading, and figure sections with explicit partial coverage. */
export const assemblePdfDocument = (
  nativePages: ReadonlyArray<NativePdfPage>,
  ocrPages: ReadonlyArray<OcrPage>,
  requestedPages: ReadonlyArray<number>,
): ExtractedDocument => {
  const recognized = new Map(ocrPages.map((page) => [page.page, page.markdown]));
  const requested = new Set(requestedPages);
  const needed = nativePages.filter(pageNeedsOcr).map((page) => page.page);
  const missed = needed.filter((page) => !recognized.get(page)?.trim());
  const capped = needed.filter((page) => !requested.has(page));
  const sections: Array<ExtractedSection> = [];
  const empty: Array<number> = [];
  for (const native of nativePages) {
    const markdown = recognized.get(native.page) ?? "";
    const merged = mergePageText(native.text, markdown);
    if (!merged) empty.push(native.page);
    sections.push(
      ...sectionsFromMarkdown(merged).map((section) => ({
        ...section,
        location: { ...section.location, page: native.page },
      })),
    );
    sections.push(...figureSections(markdown, native.page));
  }
  const parts: Array<{ part: string; status: "full" | "partial"; detail?: string }> = [
    empty.length
      ? { part: "text", status: "partial", detail: `Empty pages: ${empty.join(", ")}` }
      : { part: "text", status: "full" },
  ];
  if (needed.length > 0) {
    parts.push(
      missed.length
        ? {
            part: "ocr",
            status: "partial",
            detail: `Failed or capped pages: ${missed.join(", ")}${capped.length ? `; capped: ${capped.join(", ")}` : ""}`,
          }
        : { part: "ocr", status: "full" },
    );
  }
  return { sections, coverage: combineCoverage(parts) };
};

const readNativePages = Effect.fn("Pdf.readNativePages")(function* (bytes: Uint8Array) {
  const pdf = yield* Effect.tryPromise({
    // pdf.js rejects Node Buffers and detaches what it is given: hand it a plain copy.
    try: () => getDocumentProxy(new Uint8Array(bytes)),
    catch: (cause) => new ExtractionError({ source: "pdf", cause }),
  });
  const { OPS } = yield* Effect.tryPromise({
    try: () => getResolvedPDFJS(),
    catch: (cause) => new ExtractionError({ source: "pdf", cause }),
  });
  const numbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  return yield* Effect.forEach(
    numbers,
    (number) =>
      Effect.tryPromise({
        try: async (): Promise<NativePdfPage> => {
          const page = await pdf.getPage(number);
          const [content, operators] = await Promise.all([
            page.getTextContent(),
            page.getOperatorList(),
          ]);
          const text = content.items
            .filter((item): item is typeof item & { str: string } => "str" in item)
            .map((item) => item.str)
            .join(" ")
            .trim();
          return {
            page: number,
            text,
            hasFigure: pageHasFigure(operators, page.getViewport({ scale: 1 }), OPS),
          };
        },
        catch: (cause) => new ExtractionError({ source: "pdf", cause }),
      }),
    { concurrency: 4 },
  );
});

export const extractPdf = Effect.fn("extractPdf")(function* (bytes: Uint8Array) {
  const native = yield* readNativePages(bytes);
  const needed = native.filter(pageNeedsOcr).map((page) => page.page);
  const requested = needed.slice(0, MAX_OCR_PAGES);
  const ocr = yield* Ocr;
  // Each batch fails on its own: its pages are reported as partial coverage, not lost.
  const recognized = yield* Effect.forEach(
    Arr.chunksOf(requested, OCR_BATCH_SIZE),
    (batch) =>
      ocr.pdf(bytes, batch).pipe(
        Effect.tapError((error) => Effect.logWarning("PDF OCR failed", { pages: batch, error })),
        Effect.orElseSucceed((): ReadonlyArray<OcrPage> => []),
      ),
    { concurrency: 2 },
  ).pipe(Effect.map((batches) => batches.flat()));
  return assemblePdfDocument(native, recognized, requested);
});
