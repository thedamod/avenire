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

`/kits/iso-gl.js` exports `GLSL_COMBUSTION`, `GLSL_ISO`, `GLSL_TURN`, `glslPose(name,prefix?)`, `glCamera(P)`, `glLayer({canvas,fragment,view,camera,uniforms?,fixed?,extensions?,maxRatio?,untransformed?,onError?})`, `smooth(a,b,x)`, `burst(age,rise,fall)`, and `settle(state,target,dt,seconds,calm?)`. The `gl` namespace includes the legacy WebGL variant. These helpers position and animate fragment shaders in the same isometric camera as SVG.

`GLSL_COMBUSTION` is a reusable GLSL1 turbulent flame field. Insert it into a fragment shader and call `combustionSample(vec3(axialFraction, radialY, radialZ), timeSeconds, fuelFraction)`. Axial fraction is 0–1 from flame holder to plume tip; radial coordinates are divided by the local physical radius. It returns unpremultiplied RGB plus extinction density in alpha. Ray march in the assembly camera, clip against its cavity/nozzle, and integrate `a=1.-exp(-sample.a*stepLength*extinction)` front to back: `sum.rgb+=(1.-sum.a)*sample.rgb*a; sum.a+=(1.-sum.a)*a`. Return premultiplied `sum` with `glLayer`; do not multiply alpha twice. Choose extinction in the same world units as stepLength. This is a qualitative visual field, not CFD. It uses advected four-octave 3D value noise; a few sine waves create periodic diagonal stripes rather than turbulent flame.

The complete isometric example below installs `ISO_CSS`; geometry alone has no face or stroke styling.

## Complete widgets

These fragments run inside the widget bootstrap, which supplies the real light/dark `--figure-*` tokens. All four install `ISO_CSS` for geometry and `plateHtml` framing. Colours come only from figure tokens; lines and card frames are 0.6px. Keep the reference tables above when looking up signatures.

## Complete widget: double pendulum on canvas

```html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { doublePendulum, rk4Step, createRk4Workspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  host.innerHTML = plateHtml({fig:"Fig 1",title:"Double pendulum",hint:"Change the initial angle",readout:"",
    keys:[{mark:"edge",label:"Linked rods"},{mark:"lit",label:"Second bob"}],
    caption:"Two equal masses, 1 m rods. Energy is measured from the same state that moves the bobs.",
    body:'<canvas width="520" height="360" aria-label="Two linked pendulum rods and bobs"></canvas>'}) +
    '<div class="controls"><button data-step>Step</button><button data-run aria-pressed="false">Run</button><button data-reset>Reset</button><label>θ₁ <input data-angle type="range" min="30" max="140" value="103" aria-label="Initial first angle in degrees"></label></div>';
  const canvas = host.querySelector("canvas"), ctx = canvas.getContext("2d");
  const ratio=devicePixelRatio||1; canvas.width=520*ratio;canvas.height=360*ratio;ctx.scale(ratio,ratio);
  const h = 1/120, g = 9.81, work = createRk4Workspace(4);
  let system, state, t;
  function reset() { system = doublePendulum({gravity:g,theta1:Number(host.querySelector("[data-angle]").value)*Math.PI/180,theta2:2.4}); state = system.initial.slice(); t=0; }
  function advance() { rk4Step(system.derivative,t,state,h,state,work); t+=h; if (!state.every(Number.isFinite)) throw new RangeError("Non-finite pendulum state"); }
  function draw() {
    const css=getComputedStyle(host), ink=n=>css.getPropertyValue("--figure-"+n).trim();
    const [a,b,u,v]=state, x1=260+76*Math.sin(a), y1=168+76*Math.cos(a), x2=x1+76*Math.sin(b), y2=y1+76*Math.cos(b);
    ctx.clearRect(0,0,520,360); ctx.lineWidth=.6;
    ctx.strokeStyle=ink("lo"); ctx.beginPath(); ctx.moveTo(230,158);ctx.lineTo(290,158);ctx.stroke();
    ctx.strokeStyle=ink("hi");ctx.beginPath();ctx.moveTo(260,158);ctx.lineTo(260,168);ctx.lineTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    for (const [x,y,fill] of [[260,168,"dot"],[x1,y1,"shade-2"],[x2,y2,"lit"]]) {
      ctx.fillStyle=ink(fill);ctx.beginPath();ctx.arc(x,y,x===260&&y===168?3:8,0,2*Math.PI);ctx.fill();ctx.stroke();
    }
    const energy=u*u+.5*v*v+u*v*Math.cos(a-b)-g*(2*Math.cos(a)+Math.cos(b));
    host.querySelector("[data-readout]").textContent=`t ${t.toFixed(2)} s · E ${energy.toFixed(3)} J`;
    canvas.dataset.time=String(t);
  }
  host.querySelector("[data-angle]").oninput=()=>{reset();draw();};
  reset();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let running = !reduced.matches, visible = true, last = 0, backlog = 0;
  const run = host.querySelector("[data-run]");
  const updateRun = () => { run.textContent = running ? "Pause" : "Run"; run.setAttribute("aria-pressed", String(running)); };
  run.onclick = () => { running = !running; last = 0; updateRun(); };
  host.querySelector("[data-step]").onclick = () => { running = false; updateRun(); for (let i=0;i<6;i++) advance(); draw(); };
  host.querySelector("[data-reset]").onclick = () => { reset(); last = backlog = 0; draw(); };
  document.addEventListener("visibilitychange", () => { last = backlog = 0; });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = backlog = 0; }).observe(host);
  reduced.addEventListener("change", () => { if (reduced.matches) running = false; updateRun(); last = 0; });
  window.addEventListener("avenire:themechange", draw);
  function frame(now) {
    if (running && visible && !document.hidden) {
      backlog += last ? Math.min((now-last)/1000, .05) : 0;
      let steps=0;
      while (backlog >= h && steps++ < 6) { advance(); backlog -= h; }
      if (backlog >= h) backlog = 0;
      draw();
    }
    last = now;
    requestAnimationFrame(frame);
  }
  updateRun(); draw(); requestAnimationFrame(frame);
</script>
```

## Complete widget: three-body figure-eight on canvas

```html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { threeBodyFigureEight, velocityVerlet, createVerletWorkspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  host.innerHTML=plateHtml({fig:"Fig 2",title:"Three-body orbit",hint:"Step through the orbit",readout:"",
    keys:[{mark:"lit",label:"Body 1"},{mark:"edge",label:"Body 2"},{mark:"dim",label:"Body 3"}],
    caption:"Equal masses in a figure-eight orbit, G = 1. The readout tracks relative energy drift.",
    body:'<canvas width="520" height="330" aria-label="Three equal masses following a figure-eight orbit"></canvas>'}) + '<div class="controls"><button data-step>Step</button><button data-run aria-pressed="false">Run</button><button data-reset>Reset</button></div>';
  const canvas=host.querySelector("canvas"),ctx=canvas.getContext("2d"),system=threeBodyFigureEight();
  const ratio=devicePixelRatio||1;canvas.width=520*ratio;canvas.height=330*ratio;ctx.scale(ratio,ratio);
  const h=1/240,work=createVerletWorkspace(6);
  let q,v,t,E0;
  const energy=()=>{let e=Array.from(v).reduce((s,x)=>s+.5*x*x,0);for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)e-=1/Math.hypot(q[2*i]-q[2*j],q[2*i+1]-q[2*j+1]);return e;};
  function reset(){q=system.positions.slice();v=system.velocities.slice();t=0;E0=energy();}
  function advance(){velocityVerlet(system.acceleration,t,q,v,h,q,v,work);t+=h;if(!q.every(Number.isFinite))throw new RangeError("Non-finite orbit");}
  const guide=[],gq=system.positions.slice(),gv=system.velocities.slice(),gw=createVerletWorkspace(6);
  for(let i=0;i<1510;i++){velocityVerlet(system.acceleration,i*h,gq,gv,h,gq,gv,gw);guide.push([gq[0],gq[1]]);}
  function draw(){
    const css=getComputedStyle(host),ink=n=>css.getPropertyValue("--figure-"+n).trim();
    ctx.clearRect(0,0,520,330);ctx.lineWidth=.6;ctx.strokeStyle=ink("mid");
    ctx.beginPath();guide.forEach(([x,y],i)=>ctx[i?"lineTo":"moveTo"](260+135*x,165-135*y));ctx.stroke();
    ctx.strokeStyle=ink("lo");ctx.beginPath();ctx.moveTo(250,165);ctx.lineTo(270,165);ctx.moveTo(260,155);ctx.lineTo(260,175);ctx.stroke();
    ctx.font="12px "+css.getPropertyValue("--figure-mono");ctx.fillStyle=ink("text");ctx.fillText("x / a.u.",424,302);ctx.fillText("y / a.u.",25,28);
    for(let i=0;i<3;i++){
      const x=260+135*q[2*i],y=165-135*q[2*i+1];ctx.fillStyle=ink(["lit","shade-2","paper"][i]);ctx.strokeStyle=ink(["lit","hi","mid"][i]);
      ctx.beginPath();ctx.arc(x,y,6,0,2*Math.PI);ctx.fill();ctx.stroke();
      ctx.font="12px "+css.getPropertyValue("--figure-mono");ctx.fillStyle=ink("text");ctx.fillText(String(i+1),x+10,y-8);
    }
    host.querySelector("[data-readout]").textContent=`t ${t.toFixed(2)} · ΔE ${((energy()-E0)/Math.abs(E0)).toExponential(1)}`;
    canvas.dataset.time=String(t);
  }
  reset();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let running = !reduced.matches, visible = true, last = 0, backlog = 0;
  const run = host.querySelector("[data-run]");
  const updateRun = () => { run.textContent = running ? "Pause" : "Run"; run.setAttribute("aria-pressed", String(running)); };
  run.onclick = () => { running = !running; last = 0; updateRun(); };
  host.querySelector("[data-step]").onclick = () => { running = false; updateRun(); for (let i=0;i<6;i++) advance(); draw(); };
  host.querySelector("[data-reset]").onclick = () => { reset(); last = backlog = 0; draw(); };
  document.addEventListener("visibilitychange", () => { last = backlog = 0; });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = backlog = 0; }).observe(host);
  reduced.addEventListener("change", () => { if (reduced.matches) running = false; updateRun(); last = 0; });
  window.addEventListener("avenire:themechange", draw);
  function frame(now) {
    if (running && visible && !document.hidden) {
      backlog += last ? Math.min((now-last)/1000, .05) : 0;
      let steps=0;
      while (backlog >= h && steps++ < 6) { advance(); backlog -= h; }
      if (backlog >= h) backlog = 0;
      draw();
    }
    last = now;
    requestAnimationFrame(frame);
  }
  updateRun(); draw(); requestAnimationFrame(frame);
</script>
```

## Complete widget: noisy curve fit in SVG

```html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { fitExponential, linspace } from "/kits/math.js";
  import { ISO_CSS, plateHtml } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  let seed=19;
  const random=()=>(seed=(1664525*seed+1013904223)>>>0)/2**32-.5;
  const xs=linspace(0,4,25),ys=xs.map(x=>2.2*Math.exp(-.7*x)+.3+random()*.18);
  const {params,residuals,r2}=fitExponential(xs,ys,[2,-.5,.2]);
  const rmse=Math.sqrt(Array.from(residuals).reduce((s,r)=>s+r*r,0)/xs.length);
  host.innerHTML=plateHtml({fig:"Fig 3",title:"Exponential fit",hint:"Observed minus predicted",readout:`RMSE ${rmse.toFixed(3)} · R² ${r2.toFixed(3)}`,
    keys:[{mark:"edge",label:"Observed"},{mark:"lit",label:"Fitted"},{mark:"red",label:"Residual"}],
    caption:"25 seeded observations. A least-squares exponential fit; the lower strip shows signed residuals.",
    body:'<svg class="iso-svg" viewBox="0 0 520 330" role="img" aria-label="Response against time with labelled axes and signed residuals"></svg>'});
  const svg=host.querySelector(".iso-plate svg"),ns="http://www.w3.org/2000/svg";
  function add(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,String(v));if(text)e.textContent=text;svg.append(e);return e;}
  const X=x=>60+108*x,Y=y=>213-66*y,R=r=>279-150*r;
  const line=(x1,y1,x2,y2,tone="lo")=>add("line",{x1,y1,x2,y2,stroke:`var(--figure-${tone})`,"stroke-width":.6,"vector-effect":"non-scaling-stroke"});
  line(60,35,60,213,"mid");line(60,213,492,213,"mid");
  for(let x=0;x<=4;x++){line(X(x),213,X(x),218);add("text",{x:X(x),y:236,"text-anchor":"middle"},String(x));}
  for(let y=0;y<=2.5;y+=.5){line(55,Y(y),60,Y(y));add("text",{x:48,y:Y(y)+4,"text-anchor":"end"},y.toFixed(1));}
  add("text",{x:60,y:19},"Response / a.u.");add("text",{x:492,y:255,"text-anchor":"end"},"Time / s");
  line(60,279,492,279,"faint");add("text",{x:60,y:310},"Residual / a.u.");add("text",{x:48,y:283,"text-anchor":"end"},"0");
  add("path",{d:Array.from(linspace(0,4,160),(x,i)=>`${i?"L":"M"}${X(x)} ${Y(params[0]*Math.exp(params[1]*x)+params[2])}`).join(" "),fill:"none",stroke:"var(--figure-lit)","stroke-width":.6,"vector-effect":"non-scaling-stroke"});
  xs.forEach((x,i)=>{add("circle",{cx:X(x),cy:Y(ys[i]),r:3,fill:"var(--figure-paper)",stroke:"var(--figure-hi)","stroke-width":.6,"vector-effect":"non-scaling-stroke"});line(X(x),279,X(x),R(residuals[i]),"red");});
</script>
```

## Complete widget: isometric carriage assembly

```html
<style>
.demo{max-width:650px;margin:auto;padding:1px 20px;font:14px/1.5 var(--font-sans);color:var(--figure-text)}
.demo .iso-plate{box-shadow:none;border:var(--figure-weight) solid var(--figure-mid)}
.demo .iso-plate-corner{font-size:11px;color:var(--figure-text)}.demo .iso-legend{color:var(--figure-text)}.demo .iso-swatch path{stroke-width:var(--figure-weight)}
canvas{display:block;width:100%;max-width:520px;height:auto;margin:auto}svg text{font:12px var(--figure-mono);fill:var(--figure-text)}
.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input{accent-color:var(--figure-lit);font:12px var(--figure-mono)}
button{background:var(--figure-card);color:var(--figure-strong);border:var(--figure-weight) solid var(--figure-mid);padding:6px 12px}
button:focus-visible,input:focus-visible{outline:1px solid var(--figure-hi);outline-offset:3px}
.controls label{display:flex;align-items:center;gap:8px}
@media(max-width:560px){.demo .iso-plate-corner{white-space:normal;max-width:100%;line-height:1.4}.demo .iso-plate-corner[data-corner="hint"]{bottom:28px}.demo .iso-plate{padding-bottom:88px}}
</style>
<main class="iso demo" id="demo"></main>
<script type="module">
  import { ISO_CSS, plateHtml, fitProjection, boxCorners, slabOf, cylinder, solidSvg, figureSvg, lineSvg, lineOnTop } from "/kits/iso.js";
  const host = document.querySelector("#demo");
  const style = document.createElement("style");
  style.textContent = ISO_CSS;
  document.head.append(style);
  const base={x:0,y:0,w:90,d:58,r:5},rail={x:12,y:16,w:66,d:12,r:2},carriage={x:34,y:13,w:22,d:18,r:3};
  const P=fitProjection(boxCorners(base,0,27),520,330,{pad:45});
  const body=[
    solidSvg(slabOf(base,0,6,P),{tone:"lo"}),
    solidSvg(slabOf(rail,6,7,P),{tone:"mid"}),
    solidSvg(slabOf(carriage,13,9,P),{tone:"hi"}),
    solidSvg(cylinder(45,22,5,22,5,P),{tone:"lit",lit:true}),
    lineSvg(lineOnTop([16,42],[74,42],6,P),{tone:"faint"}),
    ...[18,28,38,48,58,68].map(x=>lineSvg(lineOnTop([x,40],[x,44],6,P),{tone:"lo"}))
  ].join("");
  host.innerHTML=plateHtml({fig:"Fig 4",title:"Carriage assembly",hint:"Four facing shades",readout:"x 45 mm · z 27 mm",
    keys:[{mark:"dim",label:"Base"},{mark:"raised",label:"Rail"},{mark:"lit",label:"Adjustment"}],
    caption:"Base, rail, carriage and adjustment knob. Shaded faces show depth.",
    body:figureSvg({width:520,height:330,label:"Small rail carriage assembly with shaded faces",body})});
</script>
```
