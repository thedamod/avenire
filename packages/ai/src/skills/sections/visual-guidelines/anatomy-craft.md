---
name: anatomy-craft
description: Construct convincing thin-line isometric parts, card composition, and depth order with the iso kit.
---

# Anatomy craft

Begin with the physical parts list and their mounts. Put a thick base on feet, a rail or post, a moving subject, one measuring feature, and restrained hardware where it would actually hold something. Draw from back to front. `fitProjection(boxCorners(plan,z0,z1),width,height,{pad})` fits the *extremes*; include moving extremes too. `slabOf(plan,z,h,P,steps,bevel)` and `cylinder(cx,cy,r,z,h,P,steps,bevel)` return paths for `solidSvg(paths,{tone,crease,lit,inner})`. Use `planOutline` and `sideSeam` for lines that finish on the silhouette; `ring`, `radialTicks`, `knurl` for dials; `coil` for springs; `lathe` and `tube` only when actual round bodies or pipes carry meaning. Verify signatures in `kit-api` and `iso-kit.ts`.

```
back: floor halo, feet, far rail/post
middle: base, support, behind-the-subject spring or cable
front: carriage, subject, pointer, near guard, labels
```

A solid has thickness, a brighter top, darker sides and a fine visible outline. Keep most parts neutral and one part lit. A fastener sits on a flange, never floats. A spring wraps a rod in two halves; draw `coil(...).back`, the rod, then `.front`. A seam ends on a true edge or fades; no detached ticks on an empty plate. On a cabinet, make a cutaway physically open so the viewer can follow the chute or cable. A pipe ends on a port or connector; crossings get clear depth order. A screen's content stays clipped to its glass and follows the face plane. At 390 px, the main object should still read; at 4×, missing joints and bad contacts should become obvious.

Use a framed card (`--figure-frame`, `--card`) with a small title, hint and readout. Reserve about 55–65% of its stage for the instrument. Place labels in the margins; short `--figure-leader` lines may point to parts, but the geometry itself should do the teaching. Avoid a forest of annotation lines. Prefer SVG for linework. A single Canvas or WebGL layer is justified for phenomena lines cannot draw (water, light, exhaust), between a back SVG and front SVG, using the same projection and a static SVG fallback. For light theme, draw ink on paper; don't reuse a dark glow through blend modes.
