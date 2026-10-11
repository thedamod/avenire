export function linearInterpolate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number,
): number {
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}
export function naturalCubicSpline(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): (x: number) => number {
  const n = xs.length;
  if (n < 2 || ys.length !== n) throw new RangeError("At least two matching knots required");
  const h = new Float64Array(n - 1),
    alpha = new Float64Array(n),
    l = new Float64Array(n),
    mu = new Float64Array(n),
    z = new Float64Array(n),
    c = new Float64Array(n),
    b = new Float64Array(n - 1),
    d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    h[i] = xs[i + 1]! - xs[i]!;
    if (h[i]! <= 0) throw new RangeError("Knots must increase");
  }
  for (let i = 1; i < n - 1; i++)
    alpha[i] = 3 * ((ys[i + 1]! - ys[i]!) / h[i]! - (ys[i]! - ys[i - 1]!) / h[i - 1]!);
  l[0] = 1;
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1]! - xs[i - 1]!) - h[i - 1]! * mu[i - 1]!;
    mu[i] = h[i]! / l[i]!;
    z[i] = (alpha[i]! - h[i - 1]! * z[i - 1]!) / l[i]!;
  }
  l[n - 1] = 1;
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j]! - mu[j]! * c[j + 1]!;
    b[j] = (ys[j + 1]! - ys[j]!) / h[j]! - (h[j]! * (c[j + 1]! + 2 * c[j]!)) / 3;
    d[j] = (c[j + 1]! - c[j]!) / (3 * h[j]!);
  }
  return (x) => {
    let lo = 0,
      hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (x < xs[m]!) hi = m;
      else lo = m;
    }
    const dx = x - xs[lo]!;
    return ys[lo]! + dx * (b[lo]! + dx * (c[lo]! + dx * d[lo]!));
  };
}
/** Scalar Catmull–Rom interpolation, t in [0,1]. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  );
}
