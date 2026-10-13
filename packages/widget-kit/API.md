# Ruth widget kits

Use inside a sandboxed widget's inline `<script type="module">`. Import only absolute paths on the widget origin: `/kits/math.js`, `/kits/iso.js`, and optionally `/kits/iso-gl.js`. The scripts make no network requests. `math.js` includes the pmndrs/math source plus the numerics below. The isometric source is MIT licensed by Ryan; pmndrs/math is MIT licensed by Isaac Mason. See `src/math/LICENSE`, `src/iso/LICENSE` and the built `LICENSES.txt`.

State vectors use `Float64Array`. Derivatives have signature `(t, y, dydt) => void` and **write every output component**. The ODE functions leave their input state intact and return new states. `matrix(rows, cols, data)` uses row-major order. Errors in shape, bracket, or convergence throw `RangeError`.

## ODE and mechanics

| Export                                                                                     | Purpose                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `eulerStep(f, t, y, h, out?, scratch?): Float64Array`                                      | One first-order Euler step.                                                                                              |
| `rk4Step(f, t, y, h, out?, workspace?): Float64Array`                                      | One fourth-order Runge–Kutta step.                                                                                       |
| `createRk4Workspace(n): Rk4Workspace`                                                      | Reusable stage arrays for allocation-free RK4 steps.                                                                     |
| `rk4(f, y0, t0, t1, h): {t,y}[]`                                                           | Fixed-step series, including both endpoints.                                                                             |
| `rk45(f, y0, t0, t1, {rtol?,atol?,h?,sampleStep?,maxSteps?}?): {t,y}[]`                    | Adaptive Dormand–Prince 5(4); accepted-step output, or regularly sampled Hermite interpolation when `sampleStep` is set. |
| `velocityVerlet(acceleration, t, q, v, h, outQ?, outV?, workspace?): {q,v}`                | Symplectic kick-drift-kick step for position-dependent acceleration.                                                     |
| `createVerletWorkspace(n): VerletWorkspace`                                                | Reusable acceleration arrays for allocation-free Verlet steps.                                                           |
| `leapfrog(acceleration, t, q, v, h, outQ?, outV?, workspace?): {q,v}`                      | Alias for velocity Verlet.                                                                                               |
| `pendulum({length?,gravity?,damping?,drive?,frequency?,angle?,angularVelocity?}?): System` | Configurable single pendulum.                                                                                            |
| `simplePendulum(options?): System`                                                         | Undamped, undriven pendulum.                                                                                             |
| `dampedPendulum(options?): System`                                                         | Pendulum with default damping 0.2.                                                                                       |
| `drivenPendulum(options?): System`                                                         | Driven pendulum with damping 0.2 and drive 1.2.                                                                          |
| `doublePendulum({m1?,m2?,l1?,l2?,gravity?,theta1?,theta2?,omega1?,omega2?}?): System`      | Four-state double pendulum `[θ1,θ2,ω1,ω2]`.                                                                              |
| `springMass({mass?,stiffness?,damping?,position?,velocity?}?): System`                     | Damped Hooke oscillator.                                                                                                 |
| `nBodyGravity(masses, {G?,softening?}?): {derivative,acceleration}`                        | Pairwise Newtonian gravity in 2D. `q` and `v` each hold interleaved `[x0,y0,x1,y1,…]`.                                   |
| `threeBodyFigureEight(): System & {masses,positions,velocities,acceleration}`              | Equal-mass periodic three-body initial condition, `G=1`.                                                                 |
| `lorenz({sigma?,rho?,beta?,initial?}?): System`                                            | Lorenz attractor `[x,y,z]`.                                                                                              |
| `sir({beta?,gamma?,initial?}?): System`                                                    | SIR epidemic fractions `[S,I,R]`.                                                                                        |
| `projectileWithDrag({gravity?,drag?,x?,y?,vx?,vy?}?): System`                              | Quadratic-drag projectile `[x,y,vx,vy]`.                                                                                 |

```js
import { rk4, lorenz } from "/kits/math.js";
const { derivative, initial } = lorenz();
const samples = rk4(derivative, initial, 0, 20, 0.01);
```

`System` is `{ derivative, initial }`. For n-body systems, the full ODE state is `[...q, ...v]`; Verlet uses the separate `positions` and `velocities` arrays.

## Roots, linear algebra, fitting

| Export                                                         | Purpose                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------- |
| `bisection(f,a,b,{tolerance?,maxIterations?}?): number`        | Guaranteed bracketed root by interval halving.                  |
| `newton(f,x,{derivative?,tolerance?,maxIterations?}?): number` | Newton root; centered numeric derivative by default.            |
| `brent(f,a,b,{tolerance?,maxIterations?}?): number`            | Fast, bracketed Brent root.                                     |
| `numericDerivative(f,x,h?): number`                            | Centered finite difference.                                     |
| `matrix(rows,cols,data): Matrix`                               | Copy data into a row-major dense matrix.                        |
| `solve(A,b): Float64Array`                                     | LU solve with partial pivoting.                                 |
| `leastSquares(A,b): Float64Array`                              | Householder QR least squares, rows ≥ columns.                   |
| `inverse(A): Matrix`                                           | Dense square inverse.                                           |
| `determinant(A): number`                                       | Signed determinant; zero for singular matrices.                 |
| `linearRegression(xs,ys): Fit & {slope,intercept}`             | Straight-line fit.                                              |
| `polynomialFit(xs,ys,degree): Fit`                             | Polynomial QR fit; coefficients in ascending powers.            |
| `nonlinearLeastSquares(xs,ys,model,initial,options?): Fit`     | Numeric-Jacobian Levenberg–Marquardt fit.                       |
| `fitExponential(xs,ys,initial?): Fit`                          | `a*exp(rate*x)+offset`, params `[a,rate,offset]`.               |
| `fitSinusoid(xs,ys,initial?): Fit`                             | `a*sin(omega*x+phase)+offset`, params `[a,omega,phase,offset]`. |
| `fitGaussian(xs,ys,initial?): Fit`                             | Gaussian plus offset, params `[a,center,sigma,offset]`.         |

`Fit` is `{params: Float64Array, residuals: Float64Array, r2: number}`. The residual is observed minus predicted. Supply an initial guess for nonlinear fitting when you know the parameter scale; the convenience functions provide guesses otherwise.

```js
import { fitExponential, brent } from "/kits/math.js";
const fit = fitExponential([0, 1, 2, 3], [3.1, 1.8, 1.2, 0.8]);
const crossing = brent((x) => x * x - 2, 1, 2);
```

## Calculus, interpolation, signals, statistics

| Export                                                      | Purpose                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `simpson(f,a,b,intervals=100): number`                      | Composite Simpson integral; even interval count.         |
| `adaptiveSimpson(f,a,b,tolerance=1e-9,maxDepth=20): number` | Recursive error-controlled integral.                     |
| `trapezoid(xs,ys): number`                                  | Trapezoid integral of unevenly spaced samples.           |
| `linearInterpolate(x0,y0,x1,y1,x): number`                  | Value on a line through two points.                      |
| `naturalCubicSpline(xs,ys): (x)=>number`                    | Natural cubic interpolant; knots must strictly increase. |
| `catmullRom(p0,p1,p2,p3,t): number`                         | Scalar Catmull–Rom segment, `t` from 0 to 1.             |
| `fft(real,imag?): {real,imag}`                              | Radix-2 complex FFT; length must be a power of two.      |
| `fftReal(samples): {real,imag}`                             | Real-input FFT helper.                                   |
| `magnitudeSpectrum(samples): Float64Array`                  | One-sided amplitudes, including DC and Nyquist.          |
| `mean(data): number`                                        | Arithmetic mean.                                         |
| `variance(data,sample=false): number`                       | Population or sample variance.                           |
| `std(data,sample=false): number`                            | Standard deviation.                                      |
| `histogram(data,bins=10,min?,max?): {edges,counts}`         | Counts in half-open bins; last bin includes max.         |
| `linspace(start,end,count): Float64Array`                   | Even samples, inclusive endpoints.                       |
| `arange(start,end,step=1): Float64Array`                    | Stepped samples, exclusive endpoint.                     |
| `mapRange(value,inMin,inMax,outMin,outMax): number`         | Affine mapping of ranges.                                |
| `clamp(value,min,max): number`                              | Clamp scalar (pmndrs core).                              |
| `lerp(a,b,t): number`                                       | Linear mix (pmndrs core).                                |

```js
import { magnitudeSpectrum, linspace, naturalCubicSpline } from "/kits/math.js";
const x = linspace(0, 1, 5);
const curve = naturalCubicSpline(x, [0, 1, 0, -1, 0]);
const spectrum = magnitudeSpectrum(
  Float64Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / 64)),
);
```

## Vendored pmndrs/math

Named namespace exports keep the large upstream API discoverable without colliding with numerics. All vector and matrix operations use the upstream **out-first** convention: pass a mutable output array first, then inputs. Reuse the output array in animation loops.

| Import                          | API family and typical call                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `vec2`, `vec3`, `vec4`          | Tuple vectors; `vec3.add(out, a, b)`, `vec3.normalize(out, a)`, `vec3.dot(a,b)`.                                                          |
| `mat2`, `mat2d`, `mat3`, `mat4` | Column-major transforms; `mat4.identity(out)`, `mat4.multiply(out,a,b)`.                                                                  |
| `quat`, `quat2`, `euler`        | Rotations and dual quaternions; `quat.slerp(out,a,b,t)`.                                                                                  |
| `spherical`, `polar`            | Coordinate conversions.                                                                                                                   |
| `shapes`                        | Namespaces `box2`, `box3`, `obb3`, `plane3`, `sphere`, `circle`, `segment2`, `polygon2`, `triangle2`, `triangle3`, `raycast3`, `frustum`. |
| `geometry`                      | `circumcircle`, polygon decomposition/triangulation, 2D and 3D quickhulls.                                                                |
| `time`                          | `easing`, `spring`, `spring2`, `spring3`, `spring4` namespaces.                                                                           |
| `random`                        | `mulberry32`, `isaac32`, `isaac64`, `random` generators.                                                                                  |
| `noise`                         | Fractal, Perlin, simplex, and Worley noise.                                                                                               |
| `color`                         | `color`, `colorspace`, `hsl` conversions and parsing.                                                                                     |
| `ik`                            | 2D and 3D FABRIK inverse kinematics.                                                                                                      |

Top-level scalar and angle signatures:

| Export                                                        | Purpose                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| `round(a)`, `equals(a,b,epsilon?)`                            | Rounded scalar and approximate equality.                    |
| `fade(t)`, `lerp(a,b,t)`, `lagrange(a,b,c,t)`                 | Smooth fade, linear mix, and three-point interpolation.     |
| `binomial(n,k)`                                               | Binomial coefficient.                                       |
| `clamp(value,min,max)`, `repeat(t,length)`                    | Bound a scalar or wrap it periodically.                     |
| `remap(value,inLow,inHigh,outLow,outHigh)`, `remapClamp(...)` | Rescale with optional clamping.                             |
| `degreesToRadians(degrees)`, `radiansToDegrees(radians)`      | Convert angle units.                                        |
| `wrapAngle(a)`, `deltaAngle(current,target)`                  | Normalize an angle and find shortest difference.            |
| `EPSILON`, `DEGREES_TO_RADIANS`, `RADIANS_TO_DEGREES`         | Scalar constants.                                           |
| `euler`                                                       | Euler angle operations; `euler.fromQuat(out, quat, "xyz")`. |

The core also exports `vec*`, `mat*`, `quat*`, `euler`, `spherical`, and `polar` at top level. The source under `src/math/` is the definitive signature reference for its 700+ individual operations.

## Isometric drawing

`/kits/iso.js` exports the isometric SVG geometry functions and namespace helpers below. Inline `ISO_CSS` in a `<style>` element, since the widget CSP allows inline styles. `iso.css` is also emitted for hosts whose style policy permits a stylesheet.

| Export                                                                                   | Purpose                                       |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| `fitProjection(points,width,height,{pad?,headroom?,azimuth?,elevation?}?): Projection`   | Camera fitting all extreme points.            |
| `iso(point,P): [sx,sy]`, `depthOf(point,P): number`, `cameraOf(P)`                       | Project and depth-sort 3D points.             |
| `slabOf(plan,z,height,P,steps?,bevel?)`, `cylinder(cx,cy,r,z,height,P,steps?,bevel?)`    | Box or round solid paths.                     |
| `extrude(ring,z,height,P,options?)`, `ringOf(plan,steps?)`, `circleRing(cx,cy,r,steps?)` | Prism and floor outlines.                     |
| `solidSvg(paths,style?)`, `lineSvg(d,style?)`, `dotsSvg(points,style?)`                  | SVG markup for solids, paths, and points.     |
| `figureSvg({width,height,label,body,standalone?,className?})`, `plateHtml(options)`      | Accessible SVG or complete card markup.       |
| `axisVector(P,vector)`, `translateAlong(P,vector)`, `holdStill(element,vector)`          | Motion helpers.                               |
| `lathe.*`, `tube.*`                                                                      | Round solids and pipes/cables as SVG paths.   |
| `canvasPainter.CANVAS2D.mount(...)`                                                      | Optional 2D painter layer.                    |
| `gl.*` and top-level WebGL helpers from `/kits/iso-gl.js`                                | Optional WebGL layer and camera/GLSL helpers. |

Other SVG runtime exports, grouped by use:

| Export                                                                                      | Purpose                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `AZIMUTH`, `ELEVATION`, `SHADES`, `ISO_CSS`                                                 | Camera defaults, tone count, and stylesheet text. |
| `pathOf(points,closed?)`, `joinPaths(paths)`                                                | Build or join SVG path strings.                   |
| `roundedPlan(plan,steps?)`, `insetPlan(plan,by)`                                            | Rounded floor polygon and its inset.              |
| `onTop(points,z,P,closed?)`, `lineOnTop(a,b,z,P)`, `planOutline(plan,z,P,steps?)`           | Lines on horizontal faces.                        |
| `ring(cx,cy,r,z,P,steps?)`, `segment(a,b,P)`, `rise(at,z0,z1,P)`                            | Round, spatial, and vertical lines.               |
| `pointsAt(points,P)`, `dotGrid(x,y,cols,rows,gap,z,P)`                                      | Project points and perforation grids.             |
| `corners(plan,inset?)`, `boxCorners(plan,z0,z1)`                                            | Floor or volume corners for composition.          |
| `knurl(cx,cy,r,z0,z1,count,P,inset?)`, `sideArc(cx,cy,r,z,P,steps?)`                        | Cylinder details.                                 |
| `sideSeam(plan,z,P,steps?)`, `ringSeam(ring,z,P)`, `sideRing(center,r,axis,P,steps?)`       | Seams and vertical-face rings.                    |
| `coil(from,to,center,r,turns,axis,P,perTurn?)`                                              | Spring linework in back/front halves.             |
| `topTicks(from,to,step,every,edge,z,lengths,P,axis?)`, `sideTicks(...)`, `radialTicks(...)` | Ruler and dial ticks.                             |
| `haloOf(plan,z,height,P)`, `screenRise(height,P)`, `towardViewer(P)`                        | Shadow path and camera measurements.              |
| `topMatrix(at,z,P,along?)`, `sideMatrix(at,z,P,face)`                                       | SVG text transforms on faces.                     |
| `fadedSvg(list,style?)`, `fadeLineSvg(points,options?)`                                     | Fading surface detail.                            |
| `wireSvg(from,to,options?)`, `faceTextSvg(transform,text,options?)`                         | Connectors and labels.                            |
| `groupSvg(children,attrs?)`, `pageHtml(options)`                                            | Markup wrappers.                                  |

The detailed option types are in `src/iso/iso-kit.ts`.

### Round parts and tubes

The `lathe` namespace is for axis-based solids. `F` is a frame from `frameAlong(origin,axis)`; `P` is the projection. A meridian/profile is a list of `[axialPosition,radius]` knots.

| Export                                                                                                                             | Purpose                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `lathe.dot3(a,b)`, `lathe.add3(a,b)`, `lathe.sub3(a,b)`, `lathe.mul3(a,k)`                                                         | Small 3D vector operations.                    |
| `lathe.len3(a)`, `lathe.unit3(a)`, `lathe.cross3(a,b)`, `lathe.lerp3(a,b,t)`                                                       | Length, normalization, cross product, and mix. |
| `lathe.viewOf(P)`, `lathe.lightOf(P)`, `lathe.scaleOf(P)`                                                                          | View, light, and camera scale.                 |
| `lathe.bandOf(score)`, `lathe.toneOf(normal,P)`                                                                                    | Surface tone from orientation.                 |
| `lathe.frameAlong(origin,axis)`, `lathe.frameOf(origin,axis,u,v)`                                                                  | Build axial coordinate frames.                 |
| `lathe.pointOf(F,s,r,angle)`, `lathe.radialOf(F,angle)`, `lathe.tangentOf(F,angle)`, `lathe.angleToward(F,direction)`              | Map axial polar points and directions.         |
| `lathe.hullOf(points)`, `lathe.runsOf(flags)`, `lathe.stepsFor(radius,least?,most?,scale?)`                                        | Hull, visible runs, and adaptive tessellation. |
| `lathe.curveRuns(meridian)`, `lathe.softOf(meridian)`                                                                              | Smooth meridian sections.                      |
| `lathe.lathe(meridian,F,P,options?)`, `lathe.outlineOf(meridian,F,P,options?)`                                                     | Shaded spun solid and its silhouette.          |
| `lathe.saddleStart(R,a,angle)`, `lathe.saddleOf(F,a,start,end,P,options?)`                                                         | Saddle joints on curved ports.                 |
| `lathe.prismOf(F,polygon,s0,s1,P)`, `lathe.stadium(r0,r1,offset,steps?)`                                                           | Axial prism and stadium outline.               |
| `lathe.sphereOf(center,r,P,options?)`, `lathe.disc(s0,s1,r,F,P,options?)`, `lathe.ringBand(s0,s1,rIn,rOut,F,P,options?)`           | Ball, disc, and annular band.                  |
| `lathe.solidOf(profile,F,P,options?)`, `lathe.bandOfProfile(profile,F,P,options?)`                                                 | Solids from radius profiles.                   |
| `lathe.silhouettePoints(profile,F,P,options?)`, `lathe.silhouetteOf(profile,F,P,options?)`, `lathe.profileCurve(profile,options?)` | Analytic profile outline.                      |
| `lathe.bandsOf(profile,cuts,F,P,options?)`                                                                                         | Tone bands along a curved body.                |
| `lathe.arcOf(F,s,r,P,options?)`, `lathe.circleOf(F,s,r,P,steps?)`, `lathe.spokesOf(F,s,r0,r1,count,P,options?)`                    | Ring arcs, circles, and spokes.                |
| `lathe.fadeOf(value,[lo,hi])`, `lathe.ribsOf(F,s0,s1,r,count,P,options?)`, `lathe.dotsOf(F,s,r,count,P,options?)`                  | Faded surface texture.                         |
| `lathe.rodOut(F,from,to,r,P,options?)`, `lathe.facingOf(F,angle,P,slope?)`                                                         | Rod and facing geometry.                       |
| `lathe.fillet(points,r,perArc?,options?)`, `lathe.resample(points,spacing)`, `lathe.pathLength(points)`                            | Smooth and measure routes.                     |
| `lathe.cut(points,from,to)`, `lathe.pointAlong(points,at)`, `lathe.tangentAlong(points,at)`                                        | Subroute and arclength queries.                |
| `lathe.spiral(F,s,r0,r1,a0,a1,steps?)`, `lathe.arcPoints(F,s,r,a0,a1,steps?)`                                                      | 3D coil and arc point sets.                    |
| `tube.runsOf(total,gaps?)`, `tube.crossingsOf(points,center,axis,radius)`                                                          | Split routes at gaps and fittings.             |
| `tube.tubePieces(points3,radius,P,options?)`, `tube.ringsSvg(rings,tone?)`, `tube.tubeSvg(piece,style?)`                           | Shade, section, and paint pipes/cables.        |
| `canvasPainter.CANVAS2D.mount(stage,controller,options?)`                                                                          | Mount optional 2D canvas painter.              |

For advanced material options, use `src/iso/lathe.mjs`, `tube.mjs`, and `canvas-painter.mjs` as the signature source.

`/kits/iso-gl.js` exports `GLSL_ISO`, `GLSL_TURN`, `glslPose(name,prefix?)`, `glCamera(P)`, `glLayer({canvas,fragment,view,camera,uniforms?,fixed?,extensions?,maxRatio?,untransformed?,onError?})`, `smooth(a,b,x)`, `burst(age,rise,fall)`, and `settle(state,target,dt,seconds,calm?)`. The `gl` namespace includes the legacy WebGL variant. These helpers position and animate fragment shaders in the same isometric camera as SVG.

```js
import { fitProjection, boxCorners, slabOf, solidSvg, figureSvg, ISO_CSS } from "/kits/iso.js";
const style = document.createElement("style");
style.textContent = ISO_CSS;
document.head.append(style);
const plan = { x: 0, y: 0, w: 80, d: 50, r: 5 };
const P = fitProjection(boxCorners(plan, 0, 12), 400, 250);
document.body.innerHTML = figureSvg({
  width: 400,
  height: 250,
  label: "Isometric block",
  body: solidSvg(slabOf(plan, 0, 12, P)),
});
```

## Complete widget: double pendulum on canvas

```html
<!doctype html><meta charset="utf-8" /><canvas
  id="view"
  width="520"
  height="360"
  aria-label="Double pendulum"
></canvas>
<script type="module">
  import { doublePendulum, rk4Step, createRk4Workspace } from "/kits/math.js";
  const canvas = document.querySelector("#view"),
    ctx = canvas.getContext("2d");
  const { derivative, initial } = doublePendulum({ gravity: 4, theta1: 1.8, theta2: 2.4 });
  let state = initial,
    t = 0,
    workspace = createRk4Workspace(initial.length);
  function frame() {
    for (let i = 0; i < 4; i++) {
      rk4Step(derivative, t, state, 1 / 240, state, workspace);
      t += 1 / 240;
    }
    const [a, b] = state,
      cx = 260,
      cy = 85,
      scale = 105;
    const x1 = cx + scale * Math.sin(a),
      y1 = cy + scale * Math.cos(a);
    const x2 = x1 + scale * Math.sin(b),
      y2 = y1 + scale * Math.cos(b);
    ctx.clearRect(0, 0, 520, 360);
    ctx.strokeStyle = "#d7e3ed";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillStyle = "#4ab9de";
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  frame();
</script>
```

## Complete widget: three-body figure-eight on canvas

```html
<!doctype html><meta charset="utf-8" /><canvas
  id="view"
  width="520"
  height="360"
  aria-label="Three-body orbit"
></canvas>
<script type="module">
  import { threeBodyFigureEight, velocityVerlet, createVerletWorkspace } from "/kits/math.js";
  const canvas = document.querySelector("#view"),
    ctx = canvas.getContext("2d");
  const system = threeBodyFigureEight();
  let q = system.positions,
    v = system.velocities,
    t = 0,
    workspace = createVerletWorkspace(q.length);
  const colors = ["#54c6e7", "#e9a45a", "#d983be"];
  function frame() {
    ctx.fillStyle = "rgba(8,18,28,0.12)";
    ctx.fillRect(0, 0, 520, 360);
    for (let step = 0; step < 8; step++) {
      velocityVerlet(system.acceleration, t, q, v, 0.004, q, v, workspace);
      t += 0.004;
      for (let body = 0; body < 3; body++) {
        ctx.fillStyle = colors[body];
        ctx.beginPath();
        ctx.arc(260 + q[body * 2] * 115, 180 - q[body * 2 + 1] * 115, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
</script>
```

## Complete widget: noisy curve fit plotted in SVG

```html
<!doctype html><meta charset="utf-8" /><svg
  id="plot"
  viewBox="0 0 520 300"
  role="img"
  aria-label="Noisy exponential data and fitted curve"
></svg>
<script type="module">
  import { fitExponential, linspace } from "/kits/math.js";
  let seed = 19;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32 - 0.5;
  const xs = linspace(0, 4, 25),
    ys = xs.map((x) => 2.2 * Math.exp(-0.7 * x) + 0.3 + random() * 0.18);
  const { params } = fitExponential(xs, ys, [2, -0.5, 0.2]);
  const X = (x) => 36 + x * 112,
    Y = (y) => 270 - y * 85;
  const svg = document.querySelector("#plot"),
    ns = "http://www.w3.org/2000/svg";
  const path = document.createElementNS(ns, "path"),
    points = linspace(0, 4, 160);
  path.setAttribute(
    "d",
    Array.from(
      points,
      (x, i) =>
        `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(params[0] * Math.exp(params[1] * x) + params[2]).toFixed(1)}`,
    ).join(" "),
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#3bc4dd");
  path.setAttribute("stroke-width", "2");
  svg.append(path);
  xs.forEach((x, i) => {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", String(X(x)));
    dot.setAttribute("cy", String(Y(ys[i])));
    dot.setAttribute("r", "3");
    dot.setAttribute("fill", "#f1b970");
    svg.append(dot);
  });
</script>
```
