/** Derivatives write into `dydt`; they must not replace the output array. */
export type Derivative = (t: number, y: Float64Array, dydt: Float64Array) => void;
export type Sample = { t: number; y: Float64Array };
const plus = (y: Float64Array, h: number, k: Float64Array, out: Float64Array) => {
  for (let i = 0; i < y.length; i++) out[i] = y[i]! + h * k[i]!;
};
export function eulerStep(
  f: Derivative,
  t: number,
  y: Float64Array,
  h: number,
  out = new Float64Array(y.length),
  k = new Float64Array(y.length),
): Float64Array {
  f(t, y, k);
  plus(y, h, k, out);
  return out;
}
export type Rk4Workspace = {
  a: Float64Array;
  b: Float64Array;
  c: Float64Array;
  d: Float64Array;
  tmp: Float64Array;
};
export function createRk4Workspace(n: number): Rk4Workspace {
  return {
    a: new Float64Array(n),
    b: new Float64Array(n),
    c: new Float64Array(n),
    d: new Float64Array(n),
    tmp: new Float64Array(n),
  };
}
export function rk4Step(
  f: Derivative,
  t: number,
  y: Float64Array,
  h: number,
  out = new Float64Array(y.length),
  workspace = createRk4Workspace(y.length),
): Float64Array {
  const n = y.length,
    { a, b, c, d, tmp } = workspace;
  f(t, y, a);
  plus(y, h / 2, a, tmp);
  f(t + h / 2, tmp, b);
  plus(y, h / 2, b, tmp);
  f(t + h / 2, tmp, c);
  plus(y, h, c, tmp);
  f(t + h, tmp, d);
  for (let i = 0; i < n; i++) out[i] = y[i]! + (h * (a[i]! + 2 * b[i]! + 2 * c[i]! + d[i]!)) / 6;
  return out;
}
export function rk4(f: Derivative, y0: Float64Array, t0: number, t1: number, h: number): Sample[] {
  if (!(h > 0) || t1 < t0) throw new RangeError("Require h > 0 and t1 >= t0");
  const result: Sample[] = [{ t: t0, y: y0.slice() }];
  let y: Float64Array = y0.slice(),
    t = t0;
  const workspace = createRk4Workspace(y.length);
  while (t < t1) {
    const step = Math.min(h, t1 - t);
    y = rk4Step(f, t, y, step, new Float64Array(y.length), workspace);
    t = Math.min(t1, t + step);
    result.push({ t, y });
  }
  return result;
}
/** Dormand–Prince 5(4), output at accepted steps or requested sample interval. */
export function rk45(
  f: Derivative,
  y0: Float64Array,
  t0: number,
  t1: number,
  options: {
    rtol?: number;
    atol?: number;
    h?: number;
    sampleStep?: number;
    maxSteps?: number;
  } = {},
): Sample[] {
  const { rtol = 1e-6, atol = 1e-9, sampleStep, maxSteps = 1_000_000 } = options;
  if (t1 < t0 || !(rtol > 0) || !(atol > 0) || (sampleStep !== undefined && !(sampleStep > 0)))
    throw new RangeError("Invalid integration interval or tolerance");
  const n = y0.length,
    k = Array.from({ length: 7 }, () => new Float64Array(n)),
    tmp = new Float64Array(n),
    next = new Float64Array(n);
  const a = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ];
  const c = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const b5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const b4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
  let t = t0,
    y = y0.slice(),
    h = Math.min(options.h ?? Math.max((t1 - t0) / 100, 1e-6), t1 - t0);
  const out: Sample[] = [{ t, y: y.slice() }];
  let target = sampleStep === undefined ? Infinity : t0 + sampleStep;
  for (let count = 0; t < t1; count++) {
    if (count >= maxSteps || t + h === t) throw new RangeError("RK45 did not converge");
    h = Math.min(h, t1 - t);
    for (let stage = 0; stage < 7; stage++) {
      for (let i = 0; i < n; i++) {
        let v = y[i]!;
        for (let j = 0; j < stage; j++) v += h * (a[stage]?.[j] ?? 0) * k[j]![i]!;
        tmp[i] = v;
      }
      f(t + c[stage]! * h, tmp, k[stage]!);
    }
    let error = 0;
    for (let i = 0; i < n; i++) {
      let delta = 0,
        v = y[i]!;
      for (let j = 0; j < 7; j++) {
        v += h * b5[j]! * k[j]![i]!;
        delta += h * (b5[j]! - b4[j]!) * k[j]![i]!;
      }
      next[i] = v;
      error = Math.max(
        error,
        Math.abs(delta) / (atol + rtol * Math.max(Math.abs(y[i]!), Math.abs(v))),
      );
    }
    if (error <= 1) {
      const oldT = t,
        oldY = y;
      t = Math.min(t1, t + h);
      y = next.slice();
      if (sampleStep === undefined) out.push({ t, y: y.slice() });
      else {
        // Sample by Hermite interpolation using endpoint slopes from the accepted step.
        while (target <= t + 1e-12) {
          const s = Math.min(1, (target - oldT) / h),
            s2 = s * s,
            s3 = s2 * s,
            sample = new Float64Array(n);
          for (let i = 0; i < n; i++)
            sample[i] =
              (2 * s3 - 3 * s2 + 1) * oldY[i]! +
              (s3 - 2 * s2 + s) * h * k[0]![i]! +
              (-2 * s3 + 3 * s2) * y[i]! +
              (s3 - s2) * h * k[6]![i]!;
          out.push({ t: target, y: sample });
          target = t0 + out.length * sampleStep;
        }
      }
    }
    h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(Math.max(error, 1e-12), -0.2)));
  }
  if (out.at(-1)?.t !== t1) out.push({ t: t1, y: y.slice() });
  return out;
}
/** Acceleration writes the acceleration for positions q and velocities v. */
export type Acceleration = (t: number, q: Float64Array, v: Float64Array, out: Float64Array) => void;
export type VerletWorkspace = { a: Float64Array; nextA: Float64Array; halfV: Float64Array };
export function createVerletWorkspace(n: number): VerletWorkspace {
  return { a: new Float64Array(n), nextA: new Float64Array(n), halfV: new Float64Array(n) };
}
export function velocityVerlet(
  acceleration: Acceleration,
  t: number,
  q: Float64Array,
  v: Float64Array,
  h: number,
  outQ = new Float64Array(q.length),
  outV = new Float64Array(v.length),
  workspace = createVerletWorkspace(q.length),
): { q: Float64Array; v: Float64Array } {
  const n = q.length;
  if (v.length !== n || outQ.length !== n || outV.length !== n)
    throw new RangeError("q and v lengths differ");
  const { a, nextA, halfV } = workspace;
  acceleration(t, q, v, a);
  for (let i = 0; i < n; i++) {
    halfV[i] = v[i]! + (h * a[i]!) / 2;
    outQ[i] = q[i]! + h * halfV[i]!;
  }
  acceleration(t + h, outQ, halfV, nextA);
  for (let i = 0; i < n; i++) outV[i] = halfV[i]! + (h * nextA[i]!) / 2;
  return { q: outQ, v: outV };
}
/** Kick-drift-kick leapfrog; equivalent to velocity Verlet for position-only forces. */
export const leapfrog = velocityVerlet;
