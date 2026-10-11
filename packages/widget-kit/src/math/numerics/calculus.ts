export { numericDerivative } from "./roots.ts";
export function simpson(f: (x: number) => number, a: number, b: number, intervals = 100): number {
  if (intervals <= 0 || intervals % 2) throw new RangeError("Intervals must be positive and even");
  const h = (b - a) / intervals;
  let sum = f(a) + f(b);
  for (let i = 1; i < intervals; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h);
  return (sum * h) / 3;
}
export function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  tolerance = 1e-9,
  maxDepth = 20,
): number {
  const fa = f(a),
    fb = f(b),
    mid = (a + b) / 2,
    fm = f(mid),
    whole = ((b - a) * (fa + 4 * fm + fb)) / 6;
  const recurse = (
    left: number,
    right: number,
    fl: number,
    fr: number,
    center: number,
    estimate: number,
    tol: number,
    depth: number,
  ): number => {
    const m = (left + right) / 2,
      l = (left + m) / 2,
      r = (m + right) / 2,
      hl = f(l),
      hr = f(r),
      a = ((m - left) * (fl + 4 * hl + center)) / 6,
      c = ((right - m) * (center + 4 * hr + fr)) / 6,
      delta = a + c - estimate;
    if (depth <= 0 || Math.abs(delta) <= 15 * tol) return a + c + delta / 15;
    return (
      recurse(left, m, fl, center, hl, a, tol / 2, depth - 1) +
      recurse(m, right, center, fr, hr, c, tol / 2, depth - 1)
    );
  };
  return recurse(a, b, fa, fb, fm, whole, tolerance, maxDepth);
}
export function trapezoid(xs: ArrayLike<number>, ys: ArrayLike<number>): number {
  if (xs.length !== ys.length) throw new RangeError("Sample lengths differ");
  let sum = 0;
  for (let i = 1; i < xs.length; i++) sum += ((xs[i]! - xs[i - 1]!) * (ys[i]! + ys[i - 1]!)) / 2;
  return sum;
}
