---
name: visuals
description: Choose a direct model, mechanism, analogy, data chart or published media for the clearest explanation.
---

# Visuals

Start with the learning question and choose the simplest faithful representation. Load `explainer` for interactive concept figures and physical models, `style` for the common frame/tokens, and `kit-api` only when exact signatures are needed. The code can be concise SVG/Canvas, kit components or an optional Node build.

| Request | Representation |
| --- | --- |
| “Show a simple pendulum”; “play with a double pendulum” | Direct physical model: pivot, rods and bobs; real numerical state |
| “Explain how an engine works” | The actual mechanism/cutaway: piston, crank, valves and four strokes |
| “Explain how gradient descent finds a minimum, with the help of an interactive visualization” | A follower on a loss profile with slope-controlled feed, or direct mathematical geometry if clearer |
| “Why does a cache avoid repeated work?” | A faithful analogy/mechanism showing the matching state and avoided work |
| “Compare v1 and v2 numbers”; “plot this spreadsheet”; “show the trend” | `chart` with actual data, units and shared scales |
| Large static data or print/export | `sandbox` computation and published PNG/SVG/PDF |
| A timed sequence that does not benefit from input | `sandbox` video, published with `publish_asset` |

Do not invent an elaborate analogy for a physical system that already explains itself. Prefer a real mechanism for a real machine. Use analogy for abstract/complex concepts when its correspondences make the cause and effect easier to see. Never invent observations, numeric results or citations. Use prose or a small table if a visual adds no value.

Keep the widget quiet: one figure, a short title/hint, minimal labelled controls and 2–4 live values. A small legend and at most two short caption sentences can sit below the card. Explanations, derivations, examples and detailed assumptions belong in chat, not text panels inside the widget.

Batch skill/context lookup, build concisely, call `preview_widget` once, and repair actual errors with a fresh preview before `render_widget`. There is no step-count cap: continue until the error is fixed and the page is delivered, or explain an actual blocking failure. Avoid unnecessary redesign. Close the sandbox when finished.

Pass exactly one of `html` (512,000 bytes maximum) or `path` (8 MiB maximum). Built pages travel directly from the thread sandbox to preview/storage. Never read a multi-MB page into context. CSP permits inline scripts/styles and bundled `/kits` modules; images/media are `data:` or `blob:` only. No external libraries, fonts, network requests or sandbox file links. Use `--figure-*` tokens, accessible native controls, reduced-motion/manual stepping and a responsive stage.
