---
name: python
description: Use run_python for real computation - brute force, statistics, symbolic math, data processing over the user's material. Load before the first run_python call.
---

# Python

`run_python` runs your code once in a fresh sandbox and throws it away. Nothing persists
between calls: re-send any data the next call needs.

## When

- Brute force: enumeration, Monte Carlo, parameter sweeps, numerical solutions.
- Statistics or data processing over numbers from the user's material.
- Symbolic math you want checked (sympy).

Not for: drawing interactive visuals (write an `<avenire-sim>`), or answers you can give
exactly in prose.

## How

- numpy, scipy, pandas, sympy, matplotlib are preinstalled; ask for others with `packages`.
- Seed every random generator so results are reproducible.
- Print the numbers you will quote; keep stdout short and labelled.
- Matplotlib figures are saved and returned as figures. Use them for static results only;
  if the learner should explore the result, print the data and show it as an
  `<avenire-chart>` or feed it to a simulation.
- If a result has a parameter worth exploring, compute a small grid over it once, rather
  than planning to re-run Python per value.
- When it fails, read the error, fix the code and try once more; then explain.
