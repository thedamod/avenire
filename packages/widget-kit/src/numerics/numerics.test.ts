import { describe, expect, it } from "vite-plus/test";
import {
  brent,
  fitExponential,
  fitSinusoid,
  magnitudeSpectrum,
  naturalCubicSpline,
  nBodyGravity,
  polynomialFit,
  rk4,
  rk45,
  velocityVerlet,
} from "./index.ts";

describe("ODE solvers", () => {
  const oscillator = (_t: number, y: Float64Array, d: Float64Array) => {
    d[0] = y[1]!;
    d[1] = -y[0]!;
  };
  it("RK4 follows the analytic harmonic oscillator", () => {
    const end = rk4(oscillator, new Float64Array([1, 0]), 0, 2 * Math.PI, 0.05).at(-1)!;
    expect(Math.abs(end.y[0]! - 1)).toBeLessThan(1e-6);
    expect(Math.abs(end.y[1]!)).toBeLessThan(1e-6);
  });
  it("RK45 respects tolerance and samples at regular times", () => {
    const loose = rk45(oscillator, new Float64Array([1, 0]), 0, 20, {
      rtol: 1e-3,
      atol: 1e-5,
      h: 0.5,
    });
    const tight = rk45(oscillator, new Float64Array([1, 0]), 0, 20, {
      rtol: 1e-9,
      atol: 1e-11,
      h: 0.5,
      sampleStep: 0.2,
    });
    const error = (y: Float64Array) => Math.hypot(y[0]! - Math.cos(20), y[1]! + Math.sin(20));
    expect(error(tight.at(-1)!.y)).toBeLessThan(1e-7);
    expect(error(tight.at(-1)!.y)).toBeLessThan(error(loose.at(-1)!.y));
    expect(tight[10]!.t).toBeCloseTo(2);
  });
  it("velocity Verlet bounds energy drift in a two-body circular orbit", () => {
    const masses = [1, 1],
      { acceleration } = nBodyGravity(masses);
    let q: Float64Array = new Float64Array([-0.5, 0, 0.5, 0]),
      v: Float64Array = new Float64Array([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
    const energy = () =>
      0.5 * (v[0]! ** 2 + v[1]! ** 2 + v[2]! ** 2 + v[3]! ** 2) -
      1 / Math.hypot(q[2]! - q[0]!, q[3]! - q[1]!);
    const initial = energy();
    let drift = 0;
    for (let i = 0; i < 2000; i++) {
      ({ q, v } = velocityVerlet(acceleration, i * 0.01, q, v, 0.01));
      drift = Math.max(drift, Math.abs(energy() - initial));
    }
    expect(drift).toBeLessThan(1e-3);
  });
});

describe("fitting and interpolation", () => {
  let seed = 17;
  const noise = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 0.02;
  };
  it("LM recovers a noisy exponential", () => {
    const xs = Float64Array.from({ length: 41 }, (_, i) => i / 20),
      ys = xs.map((x) => 2.5 * Math.exp(-0.8 * x) + 0.3 + noise());
    const fit = fitExponential(xs, ys, [2.4, -0.7, 0.2]);
    expect(fit.params[0]).toBeCloseTo(2.5, 1);
    expect(fit.params[1]).toBeCloseTo(-0.8, 1);
    expect(fit.r2).toBeGreaterThan(0.999);
  });
  it("LM recovers a noisy sinusoid", () => {
    const xs = Float64Array.from({ length: 100 }, (_, i) => i * 0.08),
      ys = xs.map((x) => 1.7 * Math.sin(2.2 * x + 0.4) - 0.2 + noise());
    const fit = fitSinusoid(xs, ys);
    expect(fit.params[0]).toBeCloseTo(1.7, 1);
    expect(fit.params[1]).toBeCloseTo(2.2, 1);
    expect(fit.r2).toBeGreaterThan(0.999);
  });
  it("polynomial fit is exact on exact data", () => {
    const xs = Float64Array.from([-2, -1, 0, 1, 2, 3]),
      ys = xs.map((x) => 3 - 2 * x + 0.5 * x * x),
      fit = polynomialFit(xs, ys, 2);
    fit.params.forEach((value, i) => expect(value).toBeCloseTo([3, -2, 0.5][i]!, 12));
    expect(fit.r2).toBeCloseTo(1, 12);
  });
  it("natural cubic spline passes through knots", () => {
    const xs = [0, 1, 2, 4],
      ys = [2, -1, 3, 0],
      s = naturalCubicSpline(xs, ys);
    xs.forEach((x, i) => expect(s(x)).toBeCloseTo(ys[i]!, 12));
  });
});

describe("signals and roots", () => {
  it("FFT of a pure sine peaks at its bin", () => {
    const samples = Float64Array.from({ length: 128 }, (_, i) =>
        Math.sin((2 * Math.PI * 7 * i) / 128),
      ),
      spectrum = magnitudeSpectrum(samples);
    expect(spectrum.indexOf(Math.max(...spectrum))).toBe(7);
    expect(spectrum[7]).toBeCloseTo(1, 10);
  });
  it("Brent finds sqrt(2)", () =>
    expect(brent((x) => x * x - 2, 0, 2)).toBeCloseTo(Math.SQRT2, 11));
});
