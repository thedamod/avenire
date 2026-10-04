---
name: visuals
description: Choose how to show a concept - text, chart, simulation or video - and how to write inline visuals. Load before writing any <avenire-chart> or <avenire-sim>.
---

# Visuals

A visual is a teaching decision. Pick the modality from what the learner needs to do
with the idea: compare, follow, compute or manipulate. Prose always wraps the visual: a
one-line objective before it, and the takeaway after it.

## Pick the modality

| The concept is…                                                                                                                                      | Use                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A single formula, definition, small table or comparison                                                                                              | **Text**: markdown + `$...$` math                                                        |
| A lot of raw information: values, categories, time series, distributions                                                                             | **Chart**: `<avenire-chart>`, load `chart`                                               |
| Heavily mathematical, needs brute force (Monte Carlo, sweeps, numerics, statistics)                                                                  | Compute with `run_python` (load `python`), then show the result as a chart or simulation |
| Many moving parts that together decide the outcome (linkages, IK, fields, feedback loops, population or market models, algorithms on changing input) | **Simulation**: `<avenire-sim>`, load `simulation`                                       |
| A long ordered story: a process, a derivation, "how X leads to Y"                                                                                    | **Video**: not available in chat yet; explain in steps instead                           |

Tie-breakers:

- Prefer the cheapest modality that teaches the point: text < chart < simulation.
- "Compare / trend" → chart. "Show me how it moves" → simulation. "How likely / what if we
  tried all" → `run_python`, then a chart.
- A slider must never re-run Python. If a parameter matters, make it a simulation control
  and re-implement the cheap part in the simulation, or have `run_python` precompute a
  grid the simulation interpolates.
- Never invent numbers. Chart values come from the user's material or from `run_python`.

## Before writing a visual

1. Call `get_page_context`. Fit the visual to the surface, platform, width, colour scheme,
   theme tokens, kits and budgets it reports. On `mobile`, keep simulations simple.
2. Give the visual a short unique `id` (`id="vis-orbit"`) and a `title`.
3. To change a visual listed in `existingVisuals`, write a new one with
   `revises="<its id>"`. Don't repeat the old one.

## Writing it

- Write the tag inline where it belongs in the explanation, never inside a code fence.
- Keep explanations outside the visual; inside, only labels, values, legends and readouts.
- One strong visual beats several small ones.
