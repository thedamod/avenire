---
name: explainer
description: Explain concepts with crafted interactive figures: direct physical models for simple systems, real mechanisms for machines, and faithful analogies for abstract ideas. Combine precise numerical models with restrained isometric craft and concise controls/readouts.
---

# Interactive explainer

Choose the representation that makes the causal relationship easiest to understand. Load `style` for tokens, `mechanism` for real machines and constructed assemblies, and `kit-api` for signatures you need. Keep the explanation in chat and let the widget demonstrate it. Preserve the physical construction and detail of a machine even when its controls and surrounding prose are minimal.

## Choose the explanation before drawing

Ask: what should the learner be able to predict after moving one control?

| Concept | Best starting view | What changes and what it teaches |
| --- | --- | --- |
| Simple pendulum | Direct side view of a pivot, rod, bob and a faint trail | Change length/damping; angle, speed and period follow the same physical model |
| Double pendulum | Two linked rods and two bobs; a short trail, optional nearby initial state | Change starting angle; distinguish sensitive dependence from random motion |
| Projectile or spring | Direct trajectory or mass/spring | Change drag/stiffness; show the resulting path or oscillation with real units |
| How an engine works | Cutaway of the actual piston, crank, cylinder and valves | Step through intake, compression, power and exhaust; show which motion causes the next |
| Gradient descent | A follower on a machined loss profile with a feed linked to learning rate, or a direct curve if the mathematical geometry is clearer | The slope determines direction; learning rate determines distance; all positions/readouts use the same update |
| Cache or another abstract system | A familiar mechanism with a one-to-one mapping, such as matching pins releasing a lock | Matching state avoids repeated work; label the meaningful correspondences |
| Compare measurements or show a trend | `chart` | Preserve the actual data, scales and units |

A real physical system often explains itself: do not turn a pendulum into an elaborate unrelated machine. For an existing machine, reveal its actual mechanism before inventing an analogy. Use an analogy for a complex/abstract idea only when it reduces mental work and preserves the important causal relationships. Briefly state its limit in the caption or chat. Complexity is a reason to choose the view carefully, not to add parts or prose indiscriminately.

## A quiet widget

One dominant figure. A small `Fig n` at top left and a short mono uppercase title at top right. Put a short interaction hint bottom left and 2–4 relevant tabular values bottom right. Native labelled sliders and Step/Run/Reset controls where useful. Below the card: an optional legend with 2–4 short labels and one caption, at most two short sentences. Keep legend plus caption under about 50 words.

Do not place a lesson, derivation, assumptions panel, instructions list, repeated explanation, equation wall or multiple text cards inside the widget. Put those explanations in chat. A symbol/unit beside a control or readout is enough. Accessible descriptions may be fuller without being visibly repeated. Choose the minimum controls that expose the concept; changing an initial condition resets the state, while a live parameter change clearly continues or resets it.

## Physical craft

Use `--figure-*` tokens, opaque faces, four facing shades, 0.6px non-scaling hairlines and calm motion. Ground the object on a base or pivot with a subtle contact shadow. Base/detail use lo/faint, structure mid, the explanatory subject hi, and one lit accent. Red/green/blue are meaningful signals, never a decorative rainbow.

For mechanisms and analogies, borrow the finish of a small real instrument: feet, rails, carriage bushings, end stops, groove/ruler, screw heads, a knurled control, a dial and a probe. Each detail has a purpose and sits on another part. Keep simple physical models simple; a pivot, two rods and bobs can be the whole double pendulum.

For an actual machine, follow `mechanism` and inspect a complete source example before building. A dimensional cutaway preserves the shell, curved housing, mounts, connected assemblies and working interior. Do not reduce it to an outline, labelled blocks or a few flat slabs merely because the interface is quiet. Inspect the subject at normal scale and 4× before delivery.

- Solid parts have filled top and side faces, convincing volume and consistent lighting. Do not approximate a solid by translucent wireframes or a pile of disconnected polygons.
- Paint back to front and bottom to top; split a part that wraps a moving component into back/front pieces. Moving pieces stay in their physical depth slot.
- A seam, tick, rod or needle ends on a real edge, stroke, dot or mount. Avoid floating line ends, unsupported parts and visibly interpenetrating solids.
- Round parts are actually round: circles/ellipses or kit cylinders, lathes, rings and spheres, with only the visible rim outlined. The bob/probe must remain visible where it contacts its track.
- Reuse component functions and procedural detail; never author thousands of raw paths. Precompute static geometry, move rigid pieces by transforms, and rebuild only a shape that changes.
- Isometric camera: roughly 45° azimuth and 30° elevation, adjusted to reveal the working surfaces. A pendulum's direct side view can be clearer. Do not force 3D onto every concept.
- Fit the camera/stage around the working object; avoid huge empty faces and corners. The focal part, controls and values must remain legible at 390px.
- Motion carries meaning: a feed advances because of the actual update, a crank drives a piston, a valve opens at the appropriate stroke. Decorative wiggle is not an explanation.

## The maths drives everything

Use one state and one model for the drawing, readout, controls and caption. Keep the numerical model in a small pure function/module. Never animate a plausible-looking path independently of the numbers. State units and material simplifications compactly; a mechanism analogy must not pretend to be an exact physical simulation.

| Model | Solver |
| --- | --- |
| Smooth short live dynamics with a known small step | `rk4Step(derivative,t,state,h,out?,workspace?)` |
| Offline trajectory with sharp changes or unknown time scale | `rk45(derivative,y0,t0,t1,{rtol,atol,sampleStep,maxSteps})`, then animate samples |
| Conservative positions/velocities with position-dependent acceleration | `velocityVerlet(...)`; monitor energy drift |
| Fit observed data | `linearRegression`, `polynomialFit`, `nonlinearLeastSquares`; chart residuals |
| Algorithm or engine cycle with discrete phases | Exact state update / phase transitions; no ODE solver unless the model requires one |

Use `Float64Array` state and write every derivative component. Reuse solver workspaces/output buffers. Integrate fixed physical steps (often `h=1/120`), not one step per animation frame. Accumulate elapsed time with a 0.05s clamp, perform at most 6 substeps/frame, drop an excessive backlog, and draw once. Check finite state, boundary conditions and a meaningful invariant such as energy; stop or reset when the model leaves its domain. Do not silently clamp a divergent optimizer and describe it as convergence.

```js
import { pendulum, rk4Step, createRk4Workspace } from '/kits/math.js';
const length=1.4, gravity=9.81;
const system=pendulum({length,gravity,damping:0.08,angle:0.8});
let state=system.initial,t=0;
const work=createRk4Workspace(state.length);
function advance(h=1/120){state=rk4Step(system.derivative,t,state,h,undefined,work);t+=h;}
function energyPerMass(){const [a,w]=state;return .5*(length*w)**2+gravity*length*(1-Math.cos(a));}
```

`doublePendulum({m1,m2,l1,l2,gravity,theta1,theta2,omega1,omega2})` returns `[θ1,θ2,ω1,ω2]` state with its derivative. Use the same lengths/masses in geometry and energy. See `explainer-double-pendulum` for a complete concise page. For `projectileWithDrag`, integrate `[x,y,vx,vy]` until ground contact and interpolate the last crossing. Expensive computation can be precomputed in the sandbox and interpolated locally; do not call Python/network on every slider input.

For gradient descent use `next = x - learningRate * derivative(x)`. The gauge reads that derivative and the feed applies that update. A ball on a loss profile is a controlled follower, not a claim that gravity implements gradient descent. Distinguish local from global minima and a zero gradient at a maximum from convergence; large learning rate can overshoot or diverge.

## Runtime and delivery

Use HTML/SVG/Canvas and optional bundled kit imports (`/kits/math.js`, `/kits/iso.js`, `/kits/iso-gl.js`). Small direct models can be authored inline. For detailed assemblies, use reusable geometry components and a Node build when useful; preserve the required craft rather than shrinking the drawing to a code-size target. `get_page_context` provides the sandbox `runtime.sourceRoot`; read the closest complete source example and relevant construction references before a mechanical figure. Available source examples include dial-indicator, test-rig, arcade-cabinet, raptor-engine, ripple-tank, turning-dial, desk-computer and spot-plate. Craft, kit, motion and verify references are available under that root. Batch the relevant reads; there is no need to browse unrelated examples.

Use ES modules or a private IIFE for live code. An inlined kit already declares its helpers: do not redeclare names such as `lineOnTop` in the same global scope. Pin kit imports to the page's bundled runtime; no network, external scripts/fonts or CDN libraries. Inline `ISO_CSS` if using the isometric kit. For sandbox builds copy sources to a writable directory and preserve relative imports; reference sources are read only.

Batch skill/context lookups, then build, preview and deliver. Do not announce a 30–90 minute production workflow for normal chat. Run `preview_widget({html})` or `{path}` once to load and exercise the page in an isolated local browser on the chat server. Inspect its labeled screenshots, `ok`, summary, overflow, console, errors and per-action interaction report. The preview varies controls (min/mid/max, selects, toggles, buttons and detectable drags), checks labels/focus and watches for freezes within a 25-action/20-second exploration budget; coverage beyond that budget is unverified. `path` reads the built file from the thread sandbox, then renders locally. An `error`, `uncaught` exception, broken interaction or visible clipping is a failure: repair it, rebuild if needed, and preview again until it is clean. Use as many steps as necessary to fix the error, freshly preview and deliver. Avoid unnecessary reference browsing, decoration or unrelated audits. Never render a known-broken page or claim an unrun check passed.

After a clean preview call `render_widget({title,html})` or `{title,path}`, explain what to notice in chat, and close the sandbox when finished. A file in the sandbox is not delivery. Use `path` for large built pages; never read a multi-MB HTML file into model context. Full geometry audits and exhaustive theme/orbit checks are for explicitly requested deep verification.

Native keyboard controls, visible focus, an accessible SVG/Canvas description and a discrete live readout are required. Reduced motion starts in a meaningful still state with manual stepping; pause while hidden/offscreen, cap frame work and reset the clock on resume. Read theme variables again on `avenire:themechange`; redraw Canvas/WebGL without resetting model state. Hint/readout must wrap or stack on phones.
