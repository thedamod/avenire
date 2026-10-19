/** Row-major dense matrix. */
export type Matrix = { rows: number; cols: number; data: Float64Array };
export function matrix(rows: number, cols: number, data: ArrayLike<number>): Matrix {
  if (data.length !== rows * cols) throw new RangeError("Matrix shape mismatch");
  return { rows, cols, data: Float64Array.from(data) };
}
function lu(a: Matrix) {
  if (a.rows !== a.cols) throw new RangeError("Square matrix required");
  const n = a.rows,
    m = a.data.slice(),
    p = Array.from({ length: n }, (_, i) => i);
  let sign = 1;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(m[i * n + k]!) > Math.abs(m[pivot * n + k]!)) pivot = i;
    if (Math.abs(m[pivot * n + k]!) < 1e-14) throw new RangeError("Singular matrix");
    if (pivot !== k) {
      for (let j = 0; j < n; j++) {
        const t = m[k * n + j]!;
        m[k * n + j] = m[pivot * n + j]!;
        m[pivot * n + j] = t;
      }
      const t = p[k]!;
      p[k] = p[pivot]!;
      p[pivot] = t;
      sign = -sign;
    }
    for (let i = k + 1; i < n; i++) {
      m[i * n + k] /= m[k * n + k]!;
      for (let j = k + 1; j < n; j++) m[i * n + j] -= m[i * n + k]! * m[k * n + j]!;
    }
  }
  return { m, p, sign };
}
export function solve(a: Matrix, b: ArrayLike<number>): Float64Array {
  const n = a.rows;
  if (b.length !== n) throw new RangeError("Right-hand side size mismatch");
  const { m, p } = lu(a),
    x = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = b[p[i]!]!;
    for (let j = 0; j < i; j++) v -= m[i * n + j]! * x[j]!;
    x[i] = v;
  }
  for (let i = n - 1; i >= 0; i--) {
    let v = x[i]!;
    for (let j = i + 1; j < n; j++) v -= m[i * n + j]! * x[j]!;
    x[i] = v / m[i * n + i]!;
  }
  return x;
}
export function determinant(a: Matrix): number {
  try {
    const { m, sign } = lu(a);
    let d = sign;
    for (let i = 0; i < a.rows; i++) d *= m[i * a.rows + i]!;
    return d;
  } catch (error) {
    if (error instanceof RangeError && error.message === "Singular matrix") return 0;
    throw error;
  }
}
export function inverse(a: Matrix): Matrix {
  if (a.rows !== a.cols) throw new RangeError("Square matrix required");
  const n = a.rows,
    out = new Float64Array(n * n),
    unit = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    unit.fill(0);
    unit[j] = 1;
    const col = solve(a, unit);
    for (let i = 0; i < n; i++) out[i * n + j] = col[i]!;
  }
  return { rows: n, cols: n, data: out };
}
/** Householder QR least squares, m >= n, full column rank. */
export function leastSquares(a: Matrix, b: ArrayLike<number>): Float64Array {
  const m = a.rows,
    n = a.cols;
  if (m < n || b.length !== m) throw new RangeError("Require rows >= columns and matching y");
  const r = a.data.slice(),
    y = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm = Math.hypot(norm, r[i * n + k]!);
    if (norm < 1e-14) throw new RangeError("Rank-deficient matrix");
    const alpha = -Math.sign(r[k * n + k]! || 1) * norm;
    const v = new Float64Array(m - k);
    v[0] = r[k * n + k]! - alpha;
    for (let i = k + 1; i < m; i++) v[i - k] = r[i * n + k]!;
    let vv = 0;
    for (const z of v) vv += z * z;
    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = k; i < m; i++) dot += v[i - k]! * r[i * n + j]!;
      const factor = (2 * dot) / vv;
      for (let i = k; i < m; i++) r[i * n + j] -= factor * v[i - k]!;
    }
    let dot = 0;
    for (let i = k; i < m; i++) dot += v[i - k]! * y[i]!;
    const factor = (2 * dot) / vv;
    for (let i = k; i < m; i++) y[i] -= factor * v[i - k]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let value = y[i]!;
    for (let j = i + 1; j < n; j++) value -= r[i * n + j]! * x[j]!;
    x[i] = value / r[i * n + i]!;
  }
  return x;
}
