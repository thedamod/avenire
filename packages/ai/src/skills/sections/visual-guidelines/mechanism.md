---
name: mechanism
description: Build detailed dimensional explanations of real machines and physical mechanisms, with recognizable assemblies, grounded parts, faithful cutaways, material shading and model-driven motion.
---

# Mechanical figures

Use this with `explainer` and `style` when the subject is a real machine, engine, instrument, assembly or physical mechanism. The object is the explanation. A machine should read as something that could be built, with its mechanism exposed. Keep ordinary data charts and simple direct physics models in their own representation.

## Flame and exhaust are part of the mechanism

For engines with combustion, read the complete `examples/raptor-engine/live.js` as well as `build.mjs` and `references/webgl.md` under the source root. Reading only `head` of live.js misses the entire shader. Its density field, ray intersections, front-to-back integration and geometry occlusion are the reference, not just its controls. A compiling shader with diagonal sine-wave stripes is not a finished flame.

The bundled `/kits/iso-gl.js` exports `GLSL_COMBUSTION`: a reusable four-octave, advected 3D value-noise flame field. Include the string in a real fragment shader and call `combustionSample(vec3(axialFraction, radialY, radialZ), timeSeconds, fuelFraction)`. Axial fraction runs from the flame holder (0) to plume tip (1); radialY/Z are offsets from the engine axis divided by the local radius. It returns RGB and extinction density. Integrate along the same camera rays as the assembly, with front-to-back transmittance: `a=1.-exp(-sample.a*worldStep*extinction); sum.rgb+=(1.-sum.a)*sample.rgb*a; sum.a+=(1.-sum.a)*a;`. glLayer expects premultiplied `sum`. Use the source reference for ray bounds, camera projection and masking; don't overlay a flat rectangular flame or stripe a cylinder.

Use an opaque, shaded assembly with a visibly illuminated combustion cavity. Flame colour needs a warm body and bright core with a transparent turbulent boundary. Fuel zero extinguishes the flame, increased fuel expands it continuously, and nozzle area comes from the same model. Keep the effect behind foreground casing and petals; don't draw foreground occluders before the flame. Check an intermediate fuel level, maximum fuel, pause/step and zero fuel in actual screenshots at normal size and close up. Require `preview_widget({path, requireWebGL:true})` for every flame/exhaust figure. A WebGL draw count is runtime evidence; compare the visible flame to the full reference before delivery.

## Establish the craft before drawing

Read the closest complete source example and the relevant craft guidance under the `runtime.sourceRoot` returned by `get_page_context` (normally `/opt/avenire/figures`). For a mounted engine with round housings, flanges, pipes and an exhaust effect, start with `examples/raptor-engine/`, `references/craft.md`, and the needed lathe/tube/WebGL references. The dial-indicator is the smaller reference for an instrument. Use the source's construction methods and finish while designing the actual subject; do not substitute an unrelated machine.

Write the causal sentence and a grouped parts list in working notes before geometry: what moves, what causes it, and what the reader can predict. Include the actual subject, its supports and connections, the moving mechanism and the control/readout. A complex assembly usually needs dozens of purposeful parts. Part count does not replace coherent geometry, and repeated decoration does not count as a mechanism.

For an afterburner, show the actual cylindrical engine/augmentor on supports: casing and cutaway thickness, turbine exit, fuel manifold and spray bars, flame holders, liner segments, flanges and fasteners, variable nozzle petals and their linkage. Reheat changes combustion and the nozzle opening from the same model; a test-stand readout follows the computed thrust. A rectangular duct, a few leader lines and a red flame triangle are a schematic study, not a finished mechanical figure.

## Volume and connection

- Use a consistent oblique/isometric camera that reveals the mechanism. Round housings remain round in perspective; use lathes, cylinders, rings and smooth curved shading instead of flat polygon stand-ins.
- Give solids thickness, opaque top/side faces, facing shades, visible rims and purposeful bevels. Ground the assembly with feet, saddles or real mounts and a soft contact shadow. Quiet styling still needs volume and material separation.
- Details come from construction: seams, ribs, clamp bands, bolt circles, brackets, bushings, connectors and linked actuators. Every part rests on or attaches to another part. Lines end on an edge, mount, dot or outline.
- The cutaway removes part of a real shell to expose the working interior; it does not flatten the whole object into a longitudinal diagram. Preserve front/back occlusion and a visible cut rim.
- Reuse procedural component builders and a build script when that supports the assembly. Precompute static geometry; transform rigid moving parts and rebuild only changing shapes. Do not omit geometry to meet an arbitrary authored-code target.
- Paint in true depth order. Split pieces that wrap another component into front/back parts. For dense round bodies, pipes, cables or moving assemblies, use the source recorder/settle/audit workflow with the true drawn shapes. Fix intersections in geometry rather than hiding them with painter-key offsets.

## Physical effects and quiet chrome

Use the shared figure tokens and thin structural lines. Four facing tones establish solids; curved bodies may shade smoothly. Contact shadows, localized reflections and volumetric flame/exhaust are physical effects and are allowed inside the drawing. Keep them attached to the object's perspective and occluded by its front geometry. A combustion-specific colour ramp can live in the flame without recolouring the frame, controls or background. Effects fade before their bounds, change continuously with the model, and have a truthful reduced-motion/non-WebGL state.

For a flame, exhaust, liquid or lighting effect whose dimensional appearance is central to the requested figure, use the relevant real shader treatment from the source references. Overlapping translucent triangles or nested Canvas 2D shells are a simplified fallback, not a volumetric shader. Request `preview_widget({path, requireWebGL:true})` for shader verification, inspect `rendering` for a live WebGL context, linked programs and draw calls, and check the actual pixels. Compilation/link/context failures must be repaired; if WebGL is unavailable, label the fallback explicitly and report the limitation. A runtime-clean Canvas 2D preview cannot establish that a shader works.

Keep the frame and controls restrained. Put explanations and detailed assumptions in chat; the visual's richness comes from the assembled object. One clear control can move many causally connected parts. A quiet interface is compatible with a detailed object.

## Finish at two scales

At normal size the assembly must be immediately recognizable and its causal motion legible. Inspect a close-up at 4× over the subject, cutaway, joins and moving interfaces: surfaces have construction detail, round bodies have smooth shading, seams terminate correctly, parts connect, and nothing intersects or floats. Compare against the closest complete source example's craft, not merely its framing.

Run `preview_widget`, inspect its actual screenshots and interaction report, and repair errors before `render_widget`. Check a phone view and both themes for this kind of dimensional figure. Source geometry/line audits and model checks complement the pixel review; a passing runtime report alone does not establish visual fidelity. If a reference, audit or effect is unavailable, state that limitation instead of quietly replacing the requested mechanism with a flat icon.
