---
name: simulation
description: Write an <avenire-sim> - an interactive simulation whose model runs in a worker on top of the Avenire viz kits. Use when many moving parts together determine the outcome.
---

# Simulation

A simulation is an HTML widget inside your markdown. Its model and drawing run in a Web
Worker on an `OffscreenCanvas`; the HTML around it is only layout, labels and readouts.

```html
<avenire-sim id="vis-arm" kit="kinematics" title="Reaching a target">
  <script type="avenire/params">
    { "segments": { "min": 2, "max": 6, "step": 1, "default": 3, "label": "Segments" },
      "jointLimitDeg": { "min": 10, "max": 180, "default": 120, "label": "Joint limit" } }
  </script>
  <script type="avenire/worker">
    export function setup(ctx) {
      const { fabrik2 } = ctx.kits.kinematics;
      let chain = fabrik2.chain(ctx.params.segments, 80);
      const target = ctx.handles.point({ x: 200, y: 0 });
      ctx.loop(() => {
        const result = chain.solve(target, { jointLimitDeg: ctx.params.jointLimitDeg });
        ctx.plot.clear();
        ctx.plot.chain(chain);
        ctx.emit("reachable", result.reachable ? "yes" : "no");
      });
    }
  </script>
  <p>Reachable: <strong data-readout="reachable"></strong></p>
</avenire-sim>
```

## The worker API (`setup(ctx)`)

- `ctx.canvas`: the `OffscreenCanvas` (2D or WebGL).
- `ctx.params`: live parameter values, declared in `avenire/params` (number ranges,
  booleans, selects). The host renders the controls.
- `ctx.loop(fn)`: the frame loop; paused offscreen and under reduced motion.
- `ctx.pointer`, `ctx.handles.point(...)`: input forwarded from the page, draggable points.
- `ctx.theme`: theme tokens from `get_page_context`.
- `ctx.data(name)`: a `run_python` data output or precomputed grid.
- `ctx.emit(name, value)`: updates elements with `data-readout="name"`.
- `ctx.kits`: only the kits `get_page_context` lists, e.g. `kinematics` (FABRIK chains,
  joint limits), `mechanics` (springs, XPBD, RK4), `fields`, `geometry`, `stochastic`
  (seeded RNG, samplers), `systems` (SIR, stock/flow), `plot`, `signals`.

## Rules

- At least two parameters that interact, or a draggable state. Otherwise use a chart.
- No network, no DOM access from worker code, no `fetch`, no external scripts.
- Stay within the frame budget from `get_page_context`; precompute what doesn't change.
- Seed randomness so a re-run shows the same thing.
- Simulations aren't only physics: epidemics, markets, Bayesian updating and algorithms
  are simulations too.
