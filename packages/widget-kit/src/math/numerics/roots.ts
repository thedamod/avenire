export function bisection(
  f: (x: number) => number,
  a: number,
  b: number,
  { tolerance = 1e-12, maxIterations = 100 } = {},
) {
  let fa = f(a),
    fb = f(b);
  if (!Number.isFinite(fa * fb) || fa * fb > 0) throw new RangeError("Root must be bracketed");
  if (fa === 0) return a;
  if (fb === 0) return b;
  for (let i = 0; i < maxIterations; i++) {
    const m = (a + b) / 2,
      fm = f(m);
    if (Math.abs(fm) <= tolerance || Math.abs(b - a) <= tolerance) return m;
    if (fa * fm < 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
export function numericDerivative(
  f: (x: number) => number,
  x: number,
  h = Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(x)),
) {
  return (f(x + h) - f(x - h)) / (2 * h);
}
export function newton(
  f: (x: number) => number,
  x: number,
  {
    derivative,
    tolerance = 1e-12,
    maxIterations = 100,
  }: { derivative?: (x: number) => number; tolerance?: number; maxIterations?: number } = {},
) {
  for (let i = 0; i < maxIterations; i++) {
    const fx = f(x);
    if (Math.abs(fx) < tolerance) return x;
    const slope = (derivative ?? ((z: number) => numericDerivative(f, z)))(x);
    if (!Number.isFinite(slope) || slope === 0) throw new RangeError("Zero or invalid derivative");
    const next = x - fx / slope;
    if (Math.abs(next - x) < tolerance) return next;
    x = next;
  }
  throw new RangeError("Newton iteration did not converge");
}
/** Brent's bracketed inverse interpolation with bisection safeguard. */
export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  { tolerance = 1e-12, maxIterations = 100 } = {},
) {
  let fa = f(a),
    fb = f(b);
  if (!Number.isFinite(fa * fb) || fa * fb > 0) throw new RangeError("Root must be bracketed");
  if (fa === 0) return a;
  if (fb === 0) return b;
  let c = a,
    fc = fa,
    d = b - a,
    e = d;
  for (let i = 0; i < maxIterations; i++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = e = b - a;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol = 2 * Number.EPSILON * Math.abs(b) + tolerance / 2,
      m = (c - b) / 2;
    if (Math.abs(m) <= tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      let p: number, q: number;
      const s = fb / fa;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const q1 = fa / fc,
          r = fb / fc;
        p = s * (2 * m * q1 * (q1 - r) - (b - a) * (r - 1));
        q = (q1 - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b);
  }
  throw new RangeError("Brent iteration did not converge");
}
