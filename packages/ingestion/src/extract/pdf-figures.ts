import type { getResolvedPDFJS } from "unpdf";

type Matrix = readonly [number, number, number, number, number, number];
type Box = readonly [number, number, number, number];
type FigureOps = Awaited<ReturnType<typeof getResolvedPDFJS>>["OPS"];

// Reject logos below 2% of the page's painted area.
const MIN_IMAGE_AREA = 0.02;
// Reject images narrower than 12% of the page.
const MIN_IMAGE_WIDTH = 0.12;
// Reject images shorter than 8% of the page.
const MIN_IMAGE_HEIGHT = 0.08;
// Reject vector paths with a side shorter than 15 pt.
const MIN_VECTOR_SIDE = 15;
// Reject vector groups covering less than 2.5% of the page.
const MIN_VECTOR_AREA = 0.025;
// Reject vector groups spanning less than 18% of page width.
const MIN_VECTOR_REGION_WIDTH = 0.18;
// Reject vector groups spanning less than 8% of page height.
const MIN_VECTOR_REGION_HEIGHT = 0.08;
// Accept filled heatmap cells at least 1 pt wide and tall.
const MIN_CELL_SIDE = 1;
// Reject table cells: filled boxes larger than 10 pt per side.
const MAX_CELL_SIDE = 10;
// Reject vector paths wider than 70% of the page as callout borders.
const MAX_VECTOR_WIDTH = 0.7;
// Reject vector paths taller than 50% of the page as callout borders.
const MAX_VECTOR_HEIGHT = 0.5;
// Accept filled bars at least 30 pt tall.
const MIN_BAR_HEIGHT = 30;
// Accept filled bars taller than 1.3 times their width.
const MIN_BAR_ASPECT = 1.3;
// Reject filled diagram nodes wider or taller than 60 pt.
const MAX_NODE_SIDE = 60;
// Accept medium images at least 10% of page height beside vector strokes.
const MIN_MEDIUM_IMAGE_HEIGHT = 0.1;
// Accept medium images covering at least 1.2% of page area.
const MIN_MEDIUM_IMAGE_AREA = 0.012;
// Reject image tiles narrower than 8% of the page.
const MIN_TILE_WIDTH = 0.08;
// Reject image tiles shorter than 4% of the page.
const MIN_TILE_HEIGHT = 0.04;
// Reject image tiles covering less than 0.4% of page area.
const MIN_TILE_AREA = 0.004;
// Accept image mosaics with at least three tiles.
const MIN_TILES = 3;
// Accept image mosaics covering at least 4% of page area.
const MIN_TILES_AREA = 0.04;
// Accept image mosaics spanning at least 25% of page width.
const MIN_TILES_SPAN_WIDTH = 0.25;
// Accept image mosaics spanning at least 8% of page height.
const MIN_TILES_SPAN_HEIGHT = 0.08;
// Accept vector diagrams with at least three strokes.
const MIN_STROKES = 3;
// Accept medium-image diagrams with at least two strokes.
const MIN_MEDIUM_IMAGE_STROKES = 2;
// Accept charts or node diagrams with at least eight filled shapes.
const MIN_FILLED_SHAPES = 8;
// Reject tables or decoration with more than 40 filled shapes.
const MAX_FILLED_SHAPES = 40;
// Reject text-heavy node groups at two or more text paints per node.
const MAX_NODE_TEXT_RATIO = 2;
// Accept heatmaps with at least 200 tiny filled cells.
const MIN_HEATMAP_CELLS = 200;
// Reject text-heavy cell grids at one or more text paints per two cells.
const MAX_CELL_TEXT_DIVISOR = 2;
// Accept shaded vector diagrams with at least two shading fills.
const MIN_SHADINGS = 2;
// Accept shaded vector diagrams with at least one stroke.
const MIN_SHADED_STROKES = 1;

const isNumericArray = (value: unknown, length: number): value is ArrayLike<number> => {
  if (
    !(value instanceof Float32Array || value instanceof Float64Array || Array.isArray(value)) ||
    value.length !== length
  )
    return false;
  for (let index = 0; index < length; index++) {
    if (typeof value[index] !== "number") return false;
  }
  return true;
};

const matrix = (value: unknown): Matrix | undefined =>
  isNumericArray(value, 6)
    ? [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0, value[4] ?? 0, value[5] ?? 0]
    : undefined;

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const transformedBox = (transform: Matrix, [x0, y0, x1, y1]: Box): Box => {
  const point = (x: number, y: number): readonly [number, number] => [
    transform[0] * x + transform[2] * y + transform[4],
    transform[1] * x + transform[3] * y + transform[5],
  ];
  const a = point(x0, y0);
  const b = point(x0, y1);
  const c = point(x1, y0);
  const d = point(x1, y1);
  return [
    Math.min(a[0], b[0], c[0], d[0]),
    Math.min(a[1], b[1], c[1], d[1]),
    Math.max(a[0], b[0], c[0], d[0]),
    Math.max(a[1], b[1], c[1], d[1]),
  ];
};

const localBox = (value: unknown): Box | undefined =>
  isNumericArray(value, 4)
    ? [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 0]
    : undefined;

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
    drawnWidth >= width * MIN_VECTOR_REGION_WIDTH &&
    drawnHeight >= height * MIN_VECTOR_REGION_HEIGHT &&
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
        width >= MIN_CELL_SIDE &&
        height >= MIN_CELL_SIDE &&
        width <= MAX_CELL_SIDE &&
        height <= MAX_CELL_SIDE
      )
        tinyCells.push(box);
      if (
        width >= MIN_VECTOR_SIDE &&
        height >= MIN_VECTOR_SIDE &&
        width <= viewport.width * MAX_VECTOR_WIDTH &&
        height <= viewport.height * MAX_VECTOR_HEIGHT
      ) {
        if (paint === ops.stroke || paint === ops.fillStroke || paint === ops.eoFillStroke)
          strokes.push(box);
        if (paint === ops.fill || paint === ops.eoFill) {
          if (height >= MIN_BAR_HEIGHT && height > width * MIN_BAR_ASPECT) filledBars.push(box);
          if (width <= MAX_NODE_SIDE && height <= MAX_NODE_SIDE) filledNodes.push(box);
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
          height >= viewport.height * MIN_MEDIUM_IMAGE_HEIGHT &&
          width * height >= pageArea * MIN_MEDIUM_IMAGE_AREA;
        if (
          width >= viewport.width * MIN_TILE_WIDTH &&
          height >= viewport.height * MIN_TILE_HEIGHT &&
          width * height >= pageArea * MIN_TILE_AREA
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
  if (imageTiles.length >= MIN_TILES) {
    const area = imageTiles.reduce((sum, [x0, y0, x1, y1]) => sum + (x1 - x0) * (y1 - y0), 0);
    const [x0, y0, x1, y1] = span(imageTiles);
    if (
      area >= pageArea * MIN_TILES_AREA &&
      x1 - x0 >= viewport.width * MIN_TILES_SPAN_WIDTH &&
      y1 - y0 >= viewport.height * MIN_TILES_SPAN_HEIGHT
    )
      return true;
  }
  if (strokes.length >= MIN_STROKES && coversRegion(strokes, viewport.width, viewport.height))
    return true;
  if (hasMediumImage && strokes.length >= MIN_MEDIUM_IMAGE_STROKES) return true;
  if (
    filledBars.length >= MIN_FILLED_SHAPES &&
    filledBars.length <= MAX_FILLED_SHAPES &&
    coversRegion(filledBars, viewport.width, viewport.height)
  )
    return true;
  if (
    filledNodes.length >= MIN_FILLED_SHAPES &&
    filledNodes.length <= MAX_FILLED_SHAPES &&
    textCount < filledNodes.length * MAX_NODE_TEXT_RATIO &&
    coversRegion(filledNodes, viewport.width, viewport.height)
  )
    return true;
  // A vector heatmap has hundreds of tiny cells; ordinary table cells are much larger.
  if (
    tinyCells.length >= MIN_HEATMAP_CELLS &&
    textCount < tinyCells.length / MAX_CELL_TEXT_DIVISOR &&
    coversRegion(tinyCells, viewport.width, viewport.height)
  )
    return true;
  return (
    shadingCount >= MIN_SHADINGS &&
    strokes.length >= MIN_SHADED_STROKES &&
    coversRegion(strokes, viewport.width, viewport.height)
  );
};
