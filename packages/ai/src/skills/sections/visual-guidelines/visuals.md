---
name: visuals
description: Choose text, chart or interactive simulation to teach a concept. Load before render_widget.
---

# Visuals

Choose what lets the learner compare, follow, compute or manipulate the idea.
Give a short objective before the visual and explain its takeaway in prose afterwards.

| Need                                             | Use                                                    |
| ------------------------------------------------ | ------------------------------------------------------ |
| A formula, definition or small comparison        | Markdown and math                                      |
| Values, categories, time series or distributions | Chart; load `chart`                                    |
| Brute force, Monte Carlo, sweeps or statistics   | Sandbox tools; load `python`, then show the results    |
| Interacting parameters or a draggable state      | Interactive HTML simulation; load `simulation`         |
| A rendered animation file                        | Sandbox Manim/ffmpeg, then `sandbox_download_artifact` |

Prefer the simplest visual that teaches the point. Never invent data: use the user's
material or computed sandbox results. A slider must not re-run Python; precompute a
small grid and interpolate locally when needed.

Call `get_page_context` first. Fit the content to its width, platform, colour scheme,
theme variables and budgets. Then call `render_widget({ title, html })` with a standalone
HTML document containing only inline CSS/JS and embedded data. Use `var(--...)` for
colours, fonts, spacing and sizes. No network, external scripts, fonts or images.
Give controls accessible labels and include a text alternative. Explain every visual
in chat prose; do not end on a tool result.

Inline `<avenire-chart>` and `<avenire-sim>` tags and runtime kits are coming later.
Do not write those tags now: all HTML visuals go through `render_widget`.
