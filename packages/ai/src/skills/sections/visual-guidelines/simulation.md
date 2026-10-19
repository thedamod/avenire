---
name: simulation
description: Render an interactive simulation as standalone HTML through render_widget when interacting parameters determine the outcome.
---

# Simulation

Call `get_page_context` first, then send a complete HTML document to `render_widget`.
Use inline CSS/JavaScript, SVG or Canvas, accessible labelled controls and readable
numeric readouts. At least two interacting parameters or a draggable state should
justify the interaction; otherwise use a chart.

Implement the model locally in JavaScript. No external kits, scripts, fonts, images or
network requests are available. For expensive computation, use sandbox tools once
and embed a small precomputed grid for interpolation. Seed randomness for reproducibility.
Never re-run Python for every control change.

Use the provided theme variables for colours, fonts, spacing and sizes. Canvas should
listen for `avenire:themechange` and re-read tokens from `getComputedStyle` before drawing.
Use `requestAnimationFrame`, stay within the frame budget, pause when hidden and
respect `prefers-reduced-motion`. Keep mobile interactions simple and supply a text
alternative. Always explain what the learner should notice in chat prose.

Inline `<avenire-sim>` tags and runtime kits are coming later; do not write them now.
