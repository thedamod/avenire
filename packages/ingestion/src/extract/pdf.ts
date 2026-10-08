import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

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
type Matrix = readonly [number, number, number, number, number, number];
type Box = readonly [number, number, number, number];
type FigureOps = Awaited<ReturnType<typeof getResolvedPDFJS>>["OPS"];

/** Painted dimensions are page fractions so a high-resolution logo stays small. */
const MIN_IMAGE_AREA = 0.02;
const MIN_IMAGE_WIDTH = 0.12;
const MIN_IMAGE_HEIGHT = 0.08;
/** A diagram needs a substantial footprint; thin table rules have no footprint. */
const MIN_VECTOR_SIDE = 15;
const MIN_VECTOR_AREA = 0.025;

const matrix = (value: unknown): Matrix | undefined => {
  if (
    !(value instanceof Float32Array || value instanceof Float64Array || Array.isArray(value)) ||
    value.length !== 6
  )
    return undefined;
  const [a, b, c, d, e, f] = value;
  return typeof a === "number" &&
    typeof b === "number" &&
    typeof c === "number" &&
    typeof d === "number" &&
    typeof e === "number" &&
    typeof f === "number"
    ? [a, b, c, d, e, f]
    : undefined;
};

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const transformedBox = (transform: Matrix, [x0, y0, x1, y1]: Box): Box => {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x0, y1],
    [x1, y0],
    [x1, y1],
  ];
  const points = corners.map(([x, y]): readonly [number, number] => [
    transform[0] * x + transform[2] * y + transform[4],
    transform[1] * x + transform[3] * y + transform[5],
  ]);
  return [
    Math.min(...points.map(([x]) => x)),
    Math.min(...points.map(([, y]) => y)),
    Math.max(...points.map(([x]) => x)),
    Math.max(...points.map(([, y]) => y)),
  ];
};

const localBox = (value: unknown): Box | undefined => {
  if (
    !(value instanceof Float32Array || value instanceof Float64Array || Array.isArray(value)) ||
    value.length !== 4
  )
    return undefined;
  const x0: unknown = value[0];
  const y0: unknown = value[1];
  const x1: unknown = value[2];
  const y1: unknown = value[3];
  return typeof x0 === "number" &&
    typeof y0 === "number" &&
    typeof x1 === "number" &&
    typeof y1 === "number"
    ? [x0, y0, x1, y1]
    : undefined;
};

const span = (boxes: ReadonlyArray<Box>): Box => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const box of boxes) {
    x0 = Math.min(x0, box[0]);
    y0 = Math.min(y0, box[1]);
    x1 = Math.max(x1, box[2]);
    y1 = Math.max(y1, box[3]);
  }
  return [x0, y0, x1, y1];
};

const coversRegion = (boxes: ReadonlyArray<Box>, width: number, height: number): boolean => {
  if (boxes.length === 0) return false;
  const [x0, y0, x1, y1] = span(boxes);
  const drawnWidth = Math.max(0, Math.min(width, x1) - Math.max(0, x0));
  const drawnHeight = Math.max(0, Math.min(height, y1) - Math.max(0, y0));
  return (
    drawnWidth >= width * 0.18 &&
    drawnHeight >= height * 0.08 &&
    drawnWidth * drawnHeight >= width * height * MIN_VECTOR_AREA
  );
};

/** pdf.js paints an image into the current transform's unit square. */
const imageBoxes = (
  op: number,
  args: unknown,
  current: Matrix,
  ops: FigureOps,
): ReadonlyArray<Box> => {
  if (!Array.isArray(args)) return [];
  if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject) {
    return [transformedBox(current, [0, 0, 1, 1])];
  }
  if (op === ops.paintImageXObjectRepeat) {
    const [, scaleX, scaleY, positions]: ReadonlyArray<unknown> = args;
    if (
      typeof scaleX !== "number" ||
      typeof scaleY !== "number" ||
      !(
        positions instanceof Float32Array ||
        positions instanceof Float64Array ||
        Array.isArray(positions)
      )
    )
      return [];
    const boxes: Array<Box> = [];
    for (let index = 0; index + 1 < positions.length; index += 2) {
      const x = positions[index];
      const y = positions[index + 1];
      if (typeof x === "number" && typeof y === "number") {
        boxes.push(transformedBox(multiply(current, [scaleX, 0, 0, scaleY, x, y]), [0, 0, 1, 1]));
      }
    }
    return boxes;
  }
  if (op === ops.paintInlineImageXObjectGroup && Array.isArray(args[1])) {
    return args[1].flatMap((entry: unknown) => {
      if (typeof entry !== "object" || entry === null || !("transform" in entry)) return [];
      const transform = matrix(entry.transform);
      return transform === undefined
        ? []
        : [transformedBox(multiply(current, transform), [0, 0, 1, 1])];
    });
  }
  return [];
};

/** Figure detection from the page's painted geometry; no text or provider calls. */
export const pageHasFigure = (
  operators: { readonly fnArray: ArrayLike<number>; readonly argsArray: ArrayLike<unknown> },
  viewport: {
    readonly width: number;
    readonly height: number;
    readonly transform: ReadonlyArray<number>;
  },
  ops: FigureOps,
): boolean => {
  const view = matrix(viewport.transform);
  if (view === undefined || viewport.width <= 0 || viewport.height <= 0) return false;
  const pageArea = viewport.width * viewport.height;
  const stack: Array<Matrix> = [];
  let current: Matrix = [1, 0, 0, 1, 0, 0];
  const strokes: Array<Box> = [];
  const filledBars: Array<Box> = [];
  const filledNodes: Array<Box> = [];
  const tinyCells: Array<Box> = [];
  const imageTiles: Array<Box> = [];
  let hasMediumImage = false;
  let textCount = 0;
  let shadingCount = 0;
  for (let index = 0; index < operators.fnArray.length; index++) {
    const op = operators.fnArray[index];
    const args = operators.argsArray[index];
    if (op === ops.save) stack.push(current);
    else if (op === ops.restore) current = stack.pop() ?? current;
    else if (op === ops.transform) {
      const next = matrix(args);
      if (next !== undefined) current = multiply(current, next);
    } else if (op === ops.showText) {
      textCount++;
    } else if (op === ops.shadingFill) {
      shadingCount++;
    } else if (op === ops.constructPath && Array.isArray(args)) {
      const paint = args[0];
      if (paint === ops.endPath) continue;
      const local = localBox(args[2]);
      if (local === undefined) continue;
      const box = transformedBox(multiply(view, current), local);
      const width = box[2] - box[0];
      const height = box[3] - box[1];
      if (
        (paint === ops.fill || paint === ops.eoFill) &&
        width >= 1 &&
        height >= 1 &&
        width <= 10 &&
        height <= 10
      )
        tinyCells.push(box);
      if (
        width >= MIN_VECTOR_SIDE &&
        height >= MIN_VECTOR_SIDE &&
        width <= viewport.width * 0.7 &&
        height <= viewport.height * 0.5
      ) {
        if (paint === ops.stroke || paint === ops.fillStroke || paint === ops.eoFillStroke)
          strokes.push(box);
        if (paint === ops.fill || paint === ops.eoFill) {
          if (height >= 30 && height > width * 1.3) filledBars.push(box);
          if (width <= 60 && height <= 60) filledNodes.push(box);
        }
      }
    } else if (
      op === ops.paintImageXObject ||
      op === ops.paintInlineImageXObject ||
      op === ops.paintImageXObjectRepeat ||
      op === ops.paintInlineImageXObjectGroup
    ) {
      const boxes = imageBoxes(op, args, multiply(view, current), ops);
      for (const [x0, y0, x1, y1] of boxes) {
        const width = Math.max(0, Math.min(viewport.width, x1) - Math.max(0, x0));
        const height = Math.max(0, Math.min(viewport.height, y1) - Math.max(0, y0));
        hasMediumImage ||=
          width >= viewport.width * MIN_IMAGE_WIDTH &&
          height >= viewport.height * 0.1 &&
          width * height >= pageArea * 0.012;
        if (
          width >= viewport.width * 0.08 &&
          height >= viewport.height * 0.04 &&
          width * height >= pageArea * 0.004
        ) {
          imageTiles.push([
            Math.max(0, x0),
            Math.max(0, y0),
            Math.min(viewport.width, x1),
            Math.min(viewport.height, y1),
          ]);
        }
        if (
          width >= viewport.width * MIN_IMAGE_WIDTH &&
          height >= viewport.height * MIN_IMAGE_HEIGHT &&
          width * height >= pageArea * MIN_IMAGE_AREA
        )
          return true;
      }
    }
  }
  if (imageTiles.length >= 3) {
    const area = imageTiles.reduce((sum, [x0, y0, x1, y1]) => sum + (x1 - x0) * (y1 - y0), 0);
    const [x0, y0, x1, y1] = span(imageTiles);
    if (
      area >= pageArea * 0.04 &&
      x1 - x0 >= viewport.width * 0.25 &&
      y1 - y0 >= viewport.height * 0.08
    )
      return true;
  }
  if (strokes.length >= 3 && coversRegion(strokes, viewport.width, viewport.height)) return true;
  if (hasMediumImage && strokes.length >= 2) return true;
  if (
    filledBars.length >= 8 &&
    filledBars.length <= 40 &&
    coversRegion(filledBars, viewport.width, viewport.height)
  )
    return true;
  if (
    filledNodes.length >= 8 &&
    filledNodes.length <= 40 &&
    textCount < filledNodes.length * 2 &&
    coversRegion(filledNodes, viewport.width, viewport.height)
  )
    return true;
  // A vector heatmap has hundreds of tiny cells; ordinary table cells are much larger.
  if (
    tinyCells.length >= 200 &&
    textCount < tinyCells.length / 2 &&
    coversRegion(tinyCells, viewport.width, viewport.height)
  )
    return true;
  return (
    shadingCount >= 2 &&
    strokes.length >= 1 &&
    coversRegion(strokes, viewport.width, viewport.height)
  );
};

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
