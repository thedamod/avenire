---
name: visuals
description: Route a Ruth visual to a plain chart, simple simulation, optional anatomy figure, or published sandbox media.
---

# Visuals

Prefer the smallest truthful visual that answers the student's question. A normal request for a comparison, trend, spreadsheet plot, or parameter sweep usually needs a plain chart or simple simulation. The fine thin-line finish in `style` applies to *every* visual; it does not require an elaborate isometric machine.

| Request or purpose | Make | Load |
| --- | --- | --- |
| “Compare v1 and v2 stats”; “plot this SEBI spreadsheet”; “show the trend” | Plain SVG grouped bars, line, area, scatter or histogram | `chart`, `style` |
| “What happens if drag changes?”; “move the initial angle” | Small interactive SVG/Canvas model with labelled controls and readout | `simulation`, `style`, `kit-api` |
| “Explain how gradient descent works as a mechanism”; “show the lock's pins” | Optional working physical analogy with real parts and one model | `anatomy`, `anatomy-craft`, `style`, `kit-api` |
| Huge static data, print/export, or a frame GIF | Python/pandas and matplotlib PNG/SVG/GIF | `sandbox`, `style` |
| A short narrated or timed math sequence that need not respond to input | manimgx MP4 | `sandbox` |
| PCB, schematic, or enclosure drawing from actual design files | `kicad-cli` export | `sandbox` |

Use prose or a small table if a visual adds no explanatory value. Never invent data, numeric results, or citations. An analogy must preserve the important causal relationships; if it would distort the concept, choose a chart or simulation.

## Widget workflow

1. Call `get_page_context` for width, platform, appearance, and theme tokens. Load the relevant skills and, for kit calls, `kit-api`.
2. Write one self-contained HTML document with inline `<style>` and `<script type="module">`. Embed computed data as JSON. Reserve the stage height (`aspect-ratio` or `min-height`) before module loading, set `width:100%`, use a fixed SVG `viewBox`, and keep text legible near 390 px.
3. Call `preview_widget({ html, width?, appearance? })`. Inspect screenshot, content height, and console. Check clipping, small labels, contrast, axis units, wrapping, zero or empty states, keyboard focus, theme, and whether the drawn state agrees with the readout. Revise and preview again, including dark and light and a narrow width when possible.
4. Call `render_widget({ title, html })` only after the preview is sound. Explain in chat prose what the learner should notice; name data source, units, and uncertainty where relevant. A tool result by itself is not an explanation.

The widget runs in an opaque-origin sandbox. CSP allows inline scripts/styles and imports only from `/kits/math.js`, `/kits/iso.js`, `/kits/iso-gl.js`; use inline `ISO_CSS` from `/kits/iso.js` because external stylesheet loads are not guaranteed. Images/media are `data:` or `blob:` only. No network requests, external fonts, chart libraries, fetch, CDN imports, or links to sandbox files. `connect-src 'none'`. Assets published with `publish_asset` are chat links, not widget imports.

Use semantic headings and a concise figure description or data table. SVG needs an accessible name; decorative parts are `aria-hidden`. All controls need labels, visible focus, native keyboard input, and a textual readout (`aria-live` only for discrete changes). Provide a static meaningful state when `prefers-reduced-motion: reduce` is set. Pause animation when the document is hidden or the figure is offscreen; cap work per frame. For Canvas, re-read computed tokens on `avenire:themechange` and redraw. Use `var(--…)` for the palette and type system.
