import { leastSquares, matrix, solve } from "./linalg.ts";
export type Fit = { params: Float64Array; residuals: Float64Array; r2: number };
function result(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  params: Float64Array,
  model: (x: number, p: Float64Array) => number,
): Fit {
  const residuals = new Float64Array(xs.length);
  let mean = 0;
  for (let i = 0; i < ys.length; i++) mean += ys[i]!;
  mean /= ys.length;
  let ss = 0,
    total = 0;
  for (let i = 0; i < ys.length; i++) {
    const r = ys[i]! - model(xs[i]!, params);
    residuals[i] = r;
    ss += r * r;
    total += (ys[i]! - mean) ** 2;
  }
  return { params, residuals, r2: total === 0 ? (ss === 0 ? 1 : 0) : 1 - ss / total };
}
export function linearRegression(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): Fit & { slope: number; intercept: number } {
  const fit = polynomialFit(xs, ys, 1);
  return { ...fit, intercept: fit.params[0]!, slope: fit.params[1]! };
}
/** Coefficients are ascending powers: c0 + c1*x + ... */
export function polynomialFit(xs: ArrayLike<number>, ys: ArrayLike<number>, degree: number): Fit {
  if (xs.length !== ys.length || xs.length <= degree || degree < 0)
    throw new RangeError("Insufficient matching samples");
  const data = new Float64Array(xs.length * (degree + 1));
  for (let i = 0; i < xs.length; i++) {
    let power = 1;
    for (let j = 0; j <= degree; j++) {
      data[i * (degree + 1) + j] = power;
      power *= xs[i]!;
    }
  }
  const params = leastSquares(matrix(xs.length, degree + 1, data), ys);
  return result(xs, ys, params, (x, p) => {
    let sum = 0,
      power = 1;
    for (const c of p) {
      sum += c * power;
      power *= x;
    }
    return sum;
  });
}
/** Numeric-Jacobian Levenberg–Marquardt. Model returns y at x for parameters p. */
export function nonlinearLeastSquares(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  model: (x: number, p: Float64Array) => number,
  initial: ArrayLike<number>,
  {
    maxIterations = 200,
    tolerance = 1e-10,
    lambda = 1e-3,
  }: { maxIterations?: number; tolerance?: number; lambda?: number } = {},
): Fit {
  if (xs.length !== ys.length || xs.length < initial.length || !xs.length)
    throw new RangeError("Insufficient matching samples");
  let p = Float64Array.from(initial),
    current = result(xs, ys, p, model),
    cost = sumsq(current.residuals);
  const n = p.length,
    m = xs.length,
    jac = new Float64Array(m * n),
    step = new Float64Array(n);
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    for (let j = 0; j < n; j++) {
      const h = 1e-5 * Math.max(1, Math.abs(p[j]!));
      const old = p[j]!;
      p[j] = old + h;
      for (let i = 0; i < m; i++) jac[i * n + j] = model(xs[i]!, p);
      p[j] = old - h;
      for (let i = 0; i < m; i++) jac[i * n + j] = (jac[i * n + j]! - model(xs[i]!, p)) / (2 * h);
      p[j] = old;
    }
    const normal = new Float64Array(n * n),
      gradient = new Float64Array(n);
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++) {
        const v = jac[i * n + j]!;
        gradient[j] += v * current.residuals[i]!;
        for (let k = 0; k <= j; k++) normal[j * n + k] += v * jac[i * n + k]!;
      }
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < j; k++) normal[k * n + j] = normal[j * n + k]!;
      normal[j * n + j] += lambda * (normal[j * n + j]! || 1);
    }
    try {
      step.set(solve(matrix(n, n, normal), gradient));
    } catch {
      lambda *= 10;
      continue;
    }
    const trial = p.map((v, i) => v + step[i]!),
      candidate = result(xs, ys, trial, model),
      newCost = sumsq(candidate.residuals);
    if (newCost < cost) {
      p = trial;
      current = candidate;
      if (Math.abs(cost - newCost) < tolerance * (1 + cost)) break;
      cost = newCost;
      lambda = Math.max(1e-12, lambda / 3);
    } else lambda = Math.min(1e12, lambda * 10);
  }
  return current;
}
const sumsq = (data: Float64Array) => {
  let s = 0;
  for (const v of data) s += v * v;
  return s;
};
/** y = amplitude * exp(rate*x) + offset; params [amplitude,rate,offset]. */
export function fitExponential(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  initial?: ArrayLike<number>,
): Fit {
  const offset = Math.min(...Array.from(ys)) - 0.01,
    amplitude = ys[0]! - offset,
    rate =
      Math.log(Math.max(1e-9, (ys[ys.length - 1]! - offset) / amplitude)) /
      (xs[xs.length - 1]! - xs[0]!);
  return nonlinearLeastSquares(
    xs,
    ys,
    (x, p) => p[0]! * Math.exp(p[1]! * x) + p[2]!,
    initial ?? [amplitude, rate, offset],
  );
}
/** y = amplitude * sin(omega*x + phase) + offset; params [amplitude,omega,phase,offset]. */
export function fitSinusoid(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  initial?: ArrayLike<number>,
): Fit {
  let seed: Float64Array;
  if (initial) seed = Float64Array.from(initial);
  else {
    const span = xs[xs.length - 1]! - xs[0]!,
      max = Math.max(...Array.from(ys)),
      min = Math.min(...Array.from(ys));
    let best = Infinity,
      omega = (2 * Math.PI) / span,
      phase = 0,
      amplitude = (max - min) / 2,
      offset = (max + min) / 2;
    for (let cycles = 0.5; cycles <= 12; cycles += 0.1) {
      const w = (2 * Math.PI * cycles) / span;
      const data = new Float64Array(xs.length * 3);
      for (let i = 0; i < xs.length; i++) {
        data[3 * i] = Math.sin(w * xs[i]!);
        data[3 * i + 1] = Math.cos(w * xs[i]!);
        data[3 * i + 2] = 1;
      }
      const c = leastSquares(matrix(xs.length, 3, data), ys);
      let error = 0;
      for (let i = 0; i < xs.length; i++) {
        const r = ys[i]! - c[0]! * data[3 * i]! - c[1]! * data[3 * i + 1]! - c[2]!;
        error += r * r;
      }
      if (error < best) {
        best = error;
        omega = w;
        amplitude = Math.hypot(c[0]!, c[1]!);
        phase = Math.atan2(c[1]!, c[0]!);
        offset = c[2]!;
      }
    }
    seed = new Float64Array([amplitude, omega, phase, offset]);
  }
  return nonlinearLeastSquares(xs, ys, (x, p) => p[0]! * Math.sin(p[1]! * x + p[2]!) + p[3]!, seed);
}
/** y = amplitude * exp(-0.5*((x-center)/sigma)^2) + offset. */
export function fitGaussian(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  initial?: ArrayLike<number>,
): Fit {
  let max = -Infinity,
    min = Infinity,
    center = 0;
  for (let i = 0; i < ys.length; i++) {
    if (ys[i]! > max) {
      max = ys[i]!;
      center = xs[i]!;
    }
    min = Math.min(min, ys[i]!);
  }
  const sigma = (xs[xs.length - 1]! - xs[0]!) / 6;
  return nonlinearLeastSquares(
    xs,
    ys,
    (x, p) => p[0]! * Math.exp(-0.5 * ((x - p[1]!) / p[2]!) ** 2) + p[3]!,
    initial ?? [max - min, center, sigma, min],
  );
}
