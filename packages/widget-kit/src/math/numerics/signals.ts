export function fft(
  real: Float64Array,
  imag = new Float64Array(real.length),
): { real: Float64Array; imag: Float64Array } {
  const n = real.length;
  if (!n || (n & (n - 1)) !== 0 || imag.length !== n)
    throw new RangeError("FFT length must be a power of two");
  const re = real.slice(),
    im = imag.slice();
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = (-2 * Math.PI) / size,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let base = 0; base < n; base += size) {
      let cr = 1,
        ci = 0;
      for (let j = 0; j < size / 2; j++) {
        const k = base + j,
          l = k + size / 2,
          tr = cr * re[l]! - ci * im[l]!,
          ti = cr * im[l]! + ci * re[l]!;
        re[l] = re[k]! - tr;
        im[l] = im[k]! - ti;
        re[k] += tr;
        im[k] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  return { real: re, imag: im };
}
export const fftReal = (samples: Float64Array) => fft(samples);
/** One-sided amplitude spectrum, including DC and Nyquist. */
export function magnitudeSpectrum(samples: Float64Array): Float64Array {
  const { real, imag } = fftReal(samples),
    out = new Float64Array(samples.length / 2 + 1);
  for (let i = 0; i < out.length; i++)
    out[i] =
      (Math.hypot(real[i]!, imag[i]!) * (i === 0 || i === samples.length / 2 ? 1 : 2)) /
      samples.length;
  return out;
}
export function mean(data: ArrayLike<number>): number {
  if (!data.length) throw new RangeError("Empty samples");
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i]!;
  return sum / data.length;
}
export function variance(data: ArrayLike<number>, sample = false): number {
  const m = mean(data);
  if (sample && data.length < 2) throw new RangeError("At least two samples required");
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += (data[i]! - m) ** 2;
  return sum / (data.length - (sample ? 1 : 0));
}
export const std = (data: ArrayLike<number>, sample = false) => Math.sqrt(variance(data, sample));
export function histogram(
  data: ArrayLike<number>,
  bins = 10,
  min?: number,
  max?: number,
): { edges: Float64Array; counts: Uint32Array } {
  if (!(bins > 0 && Number.isInteger(bins)))
    throw new RangeError("Positive integer bin count required");
  const values = Array.from(data),
    lo = min ?? Math.min(...values),
    hi = max ?? Math.max(...values),
    edges = new Float64Array(bins + 1),
    counts = new Uint32Array(bins);
  if (!(hi > lo)) throw new RangeError("Histogram range must increase");
  for (let i = 0; i <= bins; i++) edges[i] = lo + ((hi - lo) * i) / bins;
  for (const v of values)
    if (v >= lo && v <= hi) counts[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
  return { edges, counts };
}
export function linspace(start: number, end: number, count: number): Float64Array {
  if (!Number.isInteger(count) || count < 1) throw new RangeError("Positive count required");
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++)
    out[i] = count === 1 ? start : start + ((end - start) * i) / (count - 1);
  return out;
}
export function arange(start: number, end: number, step = 1): Float64Array {
  if (!Number.isFinite(step) || step === 0 || (end - start) * step < 0)
    throw new RangeError("Invalid step");
  const n = Math.max(0, Math.ceil((end - start) / step));
  return Float64Array.from({ length: n }, (_, i) => start + i * step);
}
export const mapRange = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
