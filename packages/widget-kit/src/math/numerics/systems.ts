import type { Acceleration, Derivative } from "./ode.ts";
export type System = { derivative: Derivative; initial: Float64Array };
export function pendulum({
  length = 1,
  gravity = 9.81,
  damping = 0,
  drive = 0,
  frequency = 1,
  angle = 0.8,
  angularVelocity = 0,
}: {
  length?: number;
  gravity?: number;
  damping?: number;
  drive?: number;
  frequency?: number;
  angle?: number;
  angularVelocity?: number;
} = {}): System {
  return {
    initial: new Float64Array([angle, angularVelocity]),
    derivative: (t, y, d) => {
      d[0] = y[1]!;
      d[1] =
        (-gravity / length) * Math.sin(y[0]!) - damping * y[1]! + drive * Math.cos(frequency * t);
    },
  };
}
export const simplePendulum = (
  options: { length?: number; gravity?: number; angle?: number; angularVelocity?: number } = {},
) => pendulum(options);
export const dampedPendulum = (
  options: {
    length?: number;
    gravity?: number;
    damping?: number;
    angle?: number;
    angularVelocity?: number;
  } = {},
) => pendulum({ damping: 0.2, ...options });
export const drivenPendulum = (
  options: {
    length?: number;
    gravity?: number;
    damping?: number;
    drive?: number;
    frequency?: number;
    angle?: number;
    angularVelocity?: number;
  } = {},
) => pendulum({ damping: 0.2, drive: 1.2, ...options });
export function doublePendulum({
  m1 = 1,
  m2 = 1,
  l1 = 1,
  l2 = 1,
  gravity = 9.81,
  theta1 = 2,
  theta2 = 2.2,
  omega1 = 0,
  omega2 = 0,
}: {
  m1?: number;
  m2?: number;
  l1?: number;
  l2?: number;
  gravity?: number;
  theta1?: number;
  theta2?: number;
  omega1?: number;
  omega2?: number;
} = {}): System {
  return {
    initial: new Float64Array([theta1, theta2, omega1, omega2]),
    derivative: (_t, y, d) => {
      const a = y[0]!,
        b = y[1]!,
        u = y[2]!,
        v = y[3]!,
        delta = a - b,
        den = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
      d[0] = u;
      d[1] = v;
      d[2] =
        (-gravity * (2 * m1 + m2) * Math.sin(a) -
          m2 * gravity * Math.sin(a - 2 * b) -
          2 * Math.sin(delta) * m2 * (v * v * l2 + u * u * l1 * Math.cos(delta))) /
        (l1 * den);
      d[3] =
        (2 *
          Math.sin(delta) *
          (u * u * l1 * (m1 + m2) +
            gravity * (m1 + m2) * Math.cos(a) +
            v * v * l2 * m2 * Math.cos(delta))) /
        (l2 * den);
    },
  };
}
export function springMass({
  mass = 1,
  stiffness = 4,
  damping = 0.1,
  position = 1,
  velocity = 0,
}: {
  mass?: number;
  stiffness?: number;
  damping?: number;
  position?: number;
  velocity?: number;
} = {}): System {
  return {
    initial: new Float64Array([position, velocity]),
    derivative: (_t, y, d) => {
      d[0] = y[1]!;
      d[1] = (-stiffness * y[0]! - damping * y[1]!) / mass;
    },
  };
}
/** Interleaved 2D body positions/velocities: [x0,y0,x1,y1,...]. */
export function nBodyGravity(
  masses: ArrayLike<number>,
  { G = 1, softening = 0 }: { G?: number; softening?: number } = {},
): { derivative: Derivative; acceleration: Acceleration } {
  const n = masses.length;
  const acceleration: Acceleration = (_t, q, _v, out) => {
    out.fill(0);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const dx = q[2 * j]! - q[2 * i]!,
          dy = q[2 * j + 1]! - q[2 * i + 1]!,
          r2 = dx * dx + dy * dy + softening * softening;
        const factor = G / (r2 * Math.sqrt(r2)),
          fx = dx * factor,
          fy = dy * factor;
        out[2 * i] += masses[j]! * fx;
        out[2 * i + 1] += masses[j]! * fy;
        out[2 * j] -= masses[i]! * fx;
        out[2 * j + 1] -= masses[i]! * fy;
      }
  };
  const derivative: Derivative = (t, y, d) => {
    const q = y.subarray(0, 2 * n),
      v = y.subarray(2 * n);
    d.set(v, 0);
    acceleration(t, q, v, d.subarray(2 * n));
  };
  return { derivative, acceleration };
}
export function threeBodyFigureEight(): System & {
  acceleration: Acceleration;
  masses: Float64Array;
  positions: Float64Array;
  velocities: Float64Array;
} {
  const masses = new Float64Array([1, 1, 1]);
  const positions = new Float64Array([-0.97000436, 0.24308753, 0.97000436, -0.24308753, 0, 0]);
  const velocities = new Float64Array([
    0.466203685, 0.43236573, 0.466203685, 0.43236573, -0.93240737, -0.86473146,
  ]);
  const { derivative, acceleration } = nBodyGravity(masses);
  return {
    masses,
    positions,
    velocities,
    initial: new Float64Array([...positions, ...velocities]),
    derivative,
    acceleration,
  };
}
export function lorenz({
  sigma = 10,
  rho = 28,
  beta = 8 / 3,
  initial = [1, 1, 1],
}: { sigma?: number; rho?: number; beta?: number; initial?: ArrayLike<number> } = {}): System {
  return {
    initial: Float64Array.from(initial),
    derivative: (_t, y, d) => {
      d[0] = sigma * (y[1]! - y[0]!);
      d[1] = y[0]! * (rho - y[2]!) - y[1]!;
      d[2] = y[0]! * y[1]! - beta * y[2]!;
    },
  };
}
export function sir({
  beta = 0.3,
  gamma = 0.1,
  initial = [0.99, 0.01, 0],
}: { beta?: number; gamma?: number; initial?: ArrayLike<number> } = {}): System {
  return {
    initial: Float64Array.from(initial),
    derivative: (_t, y, d) => {
      const infection = beta * y[0]! * y[1]!;
      d[0] = -infection;
      d[1] = infection - gamma * y[1]!;
      d[2] = gamma * y[1]!;
    },
  };
}
export function projectileWithDrag({
  gravity = 9.81,
  drag = 0.02,
  x = 0,
  y = 0,
  vx = 20,
  vy = 20,
}: {
  gravity?: number;
  drag?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
} = {}): System {
  return {
    initial: new Float64Array([x, y, vx, vy]),
    derivative: (_t, s, d) => {
      const speed = Math.hypot(s[2]!, s[3]!);
      d[0] = s[2]!;
      d[1] = s[3]!;
      d[2] = -drag * speed * s[2]!;
      d[3] = -gravity - drag * speed * s[3]!;
    },
  };
}
