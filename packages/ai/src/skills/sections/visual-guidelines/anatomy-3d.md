---
name: anatomy-3d
description: Use true depth rotation or a restrained WebGL layer only when anatomy's explanation requires it.
---

# Anatomy depth and WebGL

A static isometric SVG is enough for most anatomy widgets. Use 3D only when turning in depth, a hinge, or a detachable body *is* the explanation. `/kits/iso.js` supplies projection, depth (`depthOf`), solid paths, `lathe` and `tube`; `/kits/iso-gl.js` supplies `glCamera(P)`, `glLayer(...)`, `GLSL_ISO`, `GLSL_TURN`, `glslPose`, `smooth`, `burst` and `settle`. Load `kit-api` for the exact API. A simple turning dial can instead reproject a small handful of parts each frame with an updated projection azimuth, then depth-sort by `depthOf`; avoid a dense live 3D scene for a simple control.

Keep static clutter fixed and turn one small subject. Move mounts and children together. Split parts at occlusion boundaries and draw back/phenomenon/front layers in that order. Every tube ends on an actual port and keeps clearance from solids. An effect belongs in world coordinates tied to the same camera as the SVG, not an unrelated screen-space overlay. Fade uniforms in/out; make every term reach zero before canvas edges, and offer a static SVG fallback when WebGL is absent. Re-read theme tokens on `avenire:themechange`, redraw, and cap device pixel ratio and work per frame. Reduced motion gets a still frame.

Preview at several angles (including 0°, side and near-overlap), at phone width, in both themes. Look for depth inversions, disappearing contacts, a shader crossing a foreground line, and parts that jump at wraparound. Use `preview_widget` screenshots/console rather than anatomy's local Node audit scripts. If geometry is very dense, simplify the mechanism or publish a short manimgx video through `sandbox`.
