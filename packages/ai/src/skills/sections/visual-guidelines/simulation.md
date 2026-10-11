---
name: simulation
description: Build small interactive models with the math kit, fixed timesteps, accessible controls, and a live readout.
---

# Simulation

Use a simple simulation when changing a parameter reveals the answer. A static chart is enough when only precomputed outcomes matter. Call `get_page_context`; load `kit-api` for exact signatures and `style` for visual rules. Preview both a start state and an interacted state before `render_widget`.

## Solver choice

| Model | Solver |
| --- | --- |
| Smooth nonconservative dynamics, short live integration, known small step | `rk4Step(derivative,t,y,h, out?, workspace?)` |
| Offline trajectory with sharp changes or unknown time scale | `rk45(derivative,y0,t0,t1,{rtol,atol,sampleStep,maxSteps})`, then animate samples |
| Conservative positions and velocities with position-dependent acceleration | `velocityVerlet(acceleration,t,q,v,h,...)`; monitor energy drift |
| Fit rather than dynamics | `linearRegression`, `polynomialFit`, or `nonlinearLeastSquares`; render residuals |

Use typed `Float64Array` state; derivative writes *every* output component. Keep the numerical model separate from drawing. For live motion, accumulate `Math.min((now-last)/1000, 0.05)`, integrate fixed `h=1/120` steps, cap at 6–8 steps per frame, and drop excessive backlog rather than spiralling. Reuse RK4 workspace and output arrays when possible. Render once per animation frame, at most ~60 fps; reduce DOM writes and Canvas device ratio. Pause on `document.hidden` and offscreen; reset `last` when resuming. Reduced motion shows a representative static state and allows button/slider stepping without autoplay. Never advance physical time by the number of frames.

Make range inputs and buttons native and labelled; keyboard arrows should work. Show current parameters, units, model assumptions, and one derived quantity such as energy, range, error, or fit `r²`. A slider change should reset the state if it changes initial conditions, or clearly continue with a changed parameter. Do not re-run Python on each input; precompute a small grid in the sandbox and interpolate locally if the model is expensive. Use the thin-line tokens on axes, trails and parts, and avoid screen-filling animation.

Minimal pendulum state and energy:

```js
import { pendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const length = 1.4, gravity = 9.81;
const system = pendulum({ length, gravity, damping: 0.08, angle: 0.8 });
let state = system.initial, t = 0;
const work = createRk4Workspace(state.length);
function advance(h = 1/120) { state = rk4Step(system.derivative, t, state, h, undefined, work); t += h; }
function energy() { const [a,w] = state; return 0.5 * (length*w)**2 + gravity*length*(1-Math.cos(a)); }
```

Projectile with quadratic drag uses `projectileWithDrag({gravity:9.81,drag:0.02,vx:14,vy:12})`; integrate its four-state `[x,y,vx,vy]` with `rk4Step`, stop at y=0 and report approximate range. For curve fit on observed data, call `linearRegression(xs,ys)`, draw points and `fit.intercept + fit.slope*x`, and show `fit.r2`; a fitted line is analysis, not an animation. See `sim-double-pendulum` for the complete loop. Use a short manimgx MP4 through `sandbox` when the sequence is timed, cinematic, or cannot benefit from input; publish it with `publish_asset`.

```js
import { projectileWithDrag, rk4Step, linearRegression } from '/kits/math.js';
const shot = projectileWithDrag({ gravity:9.81, drag:0.02, vx:14, vy:12 });
let p = shot.initial, time = 0;
const trail = [[p[0],p[1]]];
while (p[1] >= 0 && time < 10) {
  p = rk4Step(shot.derivative,time,p,1/120);
  time += 1/120;
  trail.push([p[0],p[1]]);
}
const [x0,y0] = trail.at(-2), [x1,y1] = trail.at(-1);
const range = y1 < 0 ? x0 + (0-y0)*(x1-x0)/(y1-y0) : x1;
const xs = [0,1,2,3], ys = [1,2.1,2.9,4.2];
const fit = linearRegression(xs,ys);
const fittedAt = x => fit.intercept + fit.slope*x;
console.log({ range, r2:fit.r2, fittedAt2:fittedAt(2) });
```
