# Widget Renderer 2.0 — vision

How Ruth explains things _visually_. In v1 a "widget" meant one thing: model-written
HTML/JS in an iframe (plus a small primitive spec). In 2.0 a visual is an **artifact in one
of several modalities**, and choosing the right modality is a first-class part of Ruth's
reasoning.

Inputs to this document: the v1 renderer (`context/avenire/apps/web/src/components/Widget*`,
`packages/ai/skills/sections/visual-guidelines`), the Ruth research prototype
(`context/research/ruth`), `context/math` (pmndrs/math), and `context/animus` (Manim agent).
Research notes: `context/_notes/{v1-widgets,math,animus}.md`.

---

## 1. Principles

1. **The modality is a teaching decision, not a rendering detail.** Ruth picks how to show
   something from what the learner needs to _do_ with it: compare, follow, compute, or
   manipulate.
2. **Prose always wraps the visual.** Every artifact has a one-line learning objective,
   a caption, and an accessible text fallback. A visual never replaces the explanation.
3. **Grounded in the user's material.** Artifacts carry `sourceChunkIds`, and numbers come
   from the material or from computation, never from the model's imagination.
4. **Compute once on the server, interact on the client.** Ruth's `run_python` tool runs
   real data work in a cloud sandbox _once_ and throws the sandbox away. Everything the learner manipulates afterwards (sliders,
   drags, filters) runs on the client. A parameter change never starts a sandbox.
5. **Nothing heavy on the main thread.** All client-side artifact code (simulation steps,
   chart layout and drawing, markdown/math/code highlighting) runs in Web Workers. The main
   thread only composes DOM and forwards input, so the chat stays smooth while visuals run.
6. **Expensive things are jobs, run by subagents.** Videos render asynchronously under a
   dedicated subagent, with progress, caching and repair. The chat Ruth never blocks on them.

## 2. The modality policy

This is the rule set Ruth is trained and validated against. It encodes the owner's three
rules plus the cheap defaults around them.

| The concept is…                                                                                                                                                                                 | Use                                                                                                                                                             | Why                                                                                                             | Not                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **A large amount of raw information**: many values, categories, time series, comparisons, distributions                                                                                         | **Chart** (declarative spec)                                                                                                                                    | The value is in seeing the shape of the data; charts are cheap, exact and interactive (tooltips, filters, zoom) | Custom canvas code for something a bar/line/scatter covers |
| **A large amount of raw information with an ordered story**: a process, a derivation, a history, "how X leads to Y"                                                                             | **Video** (Manim, rendered in the sandbox by the video subagent)                                                                                                | Narrated, controlled reveals carry dense sequential information better than a static view                       | A wall of text, or a simulation the learner has to drive   |
| **Heavily mathematical, with many parts that need brute force**: enumeration, Monte Carlo, parameter sweeps, numerical solutions, statistics over real or generated data                        | Compute with **`run_python`** (a tool, not a modality), then show the result as a **chart**, a figure, or a **simulation** for whatever should stay interactive | Real computation produces trustworthy numbers                                                                   | Hand-waved numbers; re-running the sandbox per slider move |
| **Many moving parts that together determine the outcome**: linkages, inverse kinematics, mechanical systems, fields, feedback loops, population and market models, algorithms on changing input | **Simulation** (client-side, in a worker, built on `context/math`)                                                                                              | The insight comes from manipulating the inputs and watching the coupled system respond                          | A video, which can't be poked                              |
| A single formula, definition, small table or comparison                                                                                                                                         | **Text** (markdown + KaTeX + a layout primitive)                                                                                                                | Anything heavier is noise                                                                                       | Any of the above                                           |

**Simulation is not only physics.** An SIR epidemic with a vaccination slider, Bayesian
updating as evidence arrives, a supply/demand model with a tax, a sorting algorithm on
adjustable input, a neural network's decision boundary as weights change: all of these are
simulations.

Tie-breakers:

- Prefer the **cheapest modality that teaches the point** (text < chart < simulation <
  video in cost).
- **`run_python` feeds the modalities.** A Python run produces data; data becomes a chart;
  a parameter that matters becomes a simulation control (§4.3, §4.4).
- If the learner says "show me how it moves" → simulation; "walk me through" → video;
  "how often / how likely / what if we tried all" → `run_python` and then a chart;
  "compare / trend" → chart.
- On mobile, simulations run in a WebView; videos and charts work everywhere.

### Worked examples

| Prompt (grounded in the user's notes)                                                    | Modality                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| "How did CO₂ and temperature move together over the last century?" (data table in a PDF) | Chart: dual-axis line from the extracted table, with hover readouts and a year-range brush                                                            |
| "Explain how backpropagation computes gradients"                                         | Video: layer-by-layer reveal of the chain rule                                                                                                        |
| "What's the probability two people share a birthday in a class of 30?"                   | `run_python` computes the exact curve for n = 1…100 and a Monte Carlo check; a simulation then lets the learner drag n and re-roll trials client-side |
| "How does a robot arm reach a point? Why does it get stuck?"                             | Simulation: FABRIK chain with a draggable target, joint-limit sliders, an "unreachable" state                                                         |
| "How does the logistic map become chaotic?"                                              | `run_python` renders the bifurcation diagram once (millions of iterations); a simulation shows the cobweb plot for the r the learner picks            |
| "Compare sorting algorithms on random vs. sorted input"                                  | `run_python` (timed runs) feeding a chart                                                                                                             |
| "Define entropy"                                                                         | Text                                                                                                                                                  |

## 3. The artifact and how it reaches the chat

### 3.1 Document

Every visual is one record in the DB (index, provenance) with its payload in object storage.
The contract lives in `@avenire/contracts`:

```ts
type Modality = "text" | "chart" | "simulation" | "video";

interface Artifact {
  id: ArtifactId;
  schemaVersion: 2;
  modality: Modality;
  title: string;
  learningObjective: string; // "See why the chain stops when the target is out of reach"
  caption: string;
  altText: string; // accessible description; also the low-power fallback
  sourceChunkIds: ChunkId[]; // provenance into the user's material
  status: "planned" | "rendering" | "ready" | "failed";
  outputs: ArtifactOutput[]; // stored files: html, chart spec, data, svg/png, mp4/vtt, poster
  diagnostics?: Diagnostic[]; // last failure, structured
  parentArtifactId?: ArtifactId; // revisions ("make the arm longer")
}
```

- **Revisions, not overwrites:** "make it slower" creates a child artifact, so notes and
  note embeds that reference the old version stay stable.
- **Cloud runs** reuse the same document. A nightly run can produce longer videos and
  heavier computations because nobody is waiting.
- **When a record exists.** Chat visuals live inline in the message (§3.2) and get an
  `Artifact` record only when they're saved to a note, saved to a notebook, shared, or
  rendered as a job (video). Cloud runs always create records.

### 3.2 Inline in the message, with a page-context tool

Visuals are written **inline**: Ruth puts the widget straight into its markdown, and the
renderer mounts it from there. There's no upload round-trip and no extra fetch.

```html
<avenire-chart title="CO₂ vs. temperature">{ "mark": "line", … }</avenire-chart>
<avenire-sim kit="kinematics" title="Reaching a target"> … </avenire-sim>
```

**Ruth has to know the page it's drawing on.** Inline HTML written blind breaks easily: the
wrong width, colours that clash with the theme, a kit that doesn't exist, a 3D scene on a
phone. So before writing a visual Ruth calls **`get_page_context`**, which returns:

| Field                           | Example                                                | Source                             |
| ------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| `surface`                       | `chat` / `note` / `library`                            | client, sent with the chat request |
| `platform`                      | `desktop` / `web` / `mobile`                           | client                             |
| `contentWidthPx`, `colorScheme` | `720`, `dark`                                          | client                             |
| `themeTokens`, `fonts`          | `--accent`, `--ink`, `--surface-2`, body and mono font | client                             |
| `runtime`                       | viz runtime version, available kits, capabilities      | server constant                    |
| `budgets`                       | max source bytes, frame budget                         | server constant                    |
| `existingVisuals`               | `{ id, title }` of visuals already in this thread      | server, from messages              |

The client sends its half with every chat request (`body.page`), so the tool needs no
round-trip to the client. The result is cached for the turn. `existingVisuals` lets Ruth
revise ("make the arm longer") by writing a new widget with `revises="vis_…"` instead of
starting over. Later, the same tool takes an optional visual plan and validates it against
the policy (§5), so planning and page facts are one call.

**Keeping inline cheap:**

- **Token cost:** when older turns are replayed to the model, widget bodies are compacted
  to stubs (`<avenire-sim id="vis_…" title="…" />`). The stored message keeps the full
  source.
- **Validation:** the renderer validates a widget when its closing tag arrives (schema,
  size, CSP, lint) and shows a diagnostic instead of mounting a broken one. The same
  validators run server-side on the finished message, for evals and for "ask Ruth to fix".
- **Promotion to storage:** saving a visual to a note, saving it to a notebook or sharing
  it copies its source into the bucket as an `Artifact` (`artifacts/art_…/v1/index.html`).
  Notes and notebooks then reference it as `<avenire-vis src="…" />`, and a share link
  renders the stored file standalone with the same runtime and capability rules (§6).

## 4. Rendering, per modality

### 4.1 Text

Markdown + KaTeX + a small primitive set carried over from v1's spec catalog (`stat`,
`table`, `callout`, `card`, `grid`), adding `equation` (KaTeX) and `steps` (numbered
derivation). Native React from a hast tree parsed in the markdown worker (see
`docs/design/chat-view.md`). No iframe.

### 4.2 Chart

Vega-Lite can do tooltips, legend filtering and brushing, but its interactions are
spec-authored and look and feel nothing like the rest of the app. Recharts is shadcn-native
but too small: few chart types and weak support for large data. So:

- **Spec:** our own `ChartSpec`, written inline as `<avenire-chart>{…}</avenire-chart>`,
  deliberately Vega-Lite-_shaped_ because models already know that grammar. It has `mark` (bar, line, area, point, rule, arc, boxplot, heatmap,
  histogram, candlestick), `encoding` (x/y/color/size/facet with field, type, aggregate),
  `transform` (filter, aggregate, bin, window), and `data` as inline rows or a `dataRef` to
  a `run_python` data output. It's schema-validated and contains no code.
- **Interactions are the renderer's job, not the spec's.** Every chart gets the same
  shadcn-style behaviour for free: crosshair and rich tooltip, legend toggle and isolate,
  brush to zoom with reset, series and category filter chips, a data-table view, and copy
  or download of the data. The spec can only _hint_ (`interactions: { brush: "x" }`, a
  default filter).
- **Renderer, off the main thread:** a chart worker runs transforms, scales (d3-scale),
  layout, hit-testing, and drawing into an `OffscreenCanvas` (Canvas2D, LTTB downsampling
  for 100k+ points). The main thread forwards pointer events and renders only the DOM
  overlay: tooltip, legend and filter chips as shadcn components fed by the worker's
  hit-test results. Theme tokens are passed to the worker on mount and on theme change.
- **Mobile:** the same `ChartSpec`, rendered natively with Skia (victory-native) and a
  touch-friendly subset of interactions.
- The validator rejects chart-shaped requests implemented as simulation code
  ("use a chart spec").

### 4.3 The `run_python` tool (compute, not a modality)

`run_python` is a tool Ruth calls when it needs real computation: brute force, statistics,
symbolic math, data processing over the user's material. It runs once in an ephemeral
Daytona sandbox (`@avenire/cloud/sandbox`) from a prebaked
`avenire-python` snapshot (numpy, scipy, pandas, sympy, networkx, scikit-learn,
matplotlib, polars).

- **Contract with the code:** a tiny `avenire` helper module, baked into the snapshot,
  produces structured outputs instead of scraped stdout:
  - `avenire.table(df, title)`
  - `avenire.data(name, rows | df)` stores Arrow/JSON and becomes a chart `dataRef` or
    simulation input
  - `avenire.figure(fig, caption)`
  - `avenire.metric(label, value)`
  - `avenire.grid(name, axes, values)` stores a precomputed parameter grid for a simulation
    to interpolate (see below)
- **Small matplotlib figures:** rendered as **SVG** (PNG fallback) with an
  `avenire.mplstyle` mapping the host theme (font, ink, accent palette, transparent
  background). In chat they show as compact _figure cards_ (max ~360 px tall) with a
  caption and "open full". Matplotlib is for **static** results. Anything the learner
  should explore goes out as `avenire.data` and becomes a chart or simulation.
- **One run per question, not per parameter.** Each call runs once (seeded, cached by
  `hash(code, inputs, seed, runtimeVersion)`), and the sandbox is discarded afterwards.
  "Recompute" happens only when Ruth or the learner explicitly changes the computation,
  never from a slider.
- Figures render as figure cards inside the tool's row; data outputs are referenced by
  chart specs and simulations through `dataRef`.

**Handing parameters to the client.** When a computation has knobs worth exposing, Ruth picks
the cheapest tier that keeps interaction instant:

| Tier                                               | When                                                                                                                                        | How                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. JS model in the simulation worker** (default) | The per-parameter computation is cheap enough to run in the browser: Monte Carlo with ≤ ~10⁶ samples, ODE integration, small linear algebra | Python produces the data and validates the model; the simulation re-implements the cheap part on `context/math` kits and runs it in the worker   |
| **2. Precomputed grid**                            | The computation is expensive but has only 1–3 parameters                                                                                    | Python sweeps the parameter grid once (`avenire.grid`); the simulation interpolates between grid points                                          |
| **3. Pyodide in the worker**                       | The model must stay in Python (numpy/scipy) and is light per run                                                                            | The simulation loads Pyodide in its worker (lazy, cached) and re-runs the Python function on parameter change. Opt-in, and budgeted by load time |
| **4. Explicit recompute**                          | Truly heavy work (large datasets, training)                                                                                                 | A "Recompute with these settings" button asks Ruth to call `run_python` again, with a visible cost and progress. Never automatic                 |

### 4.4 Simulation (client-side, in a worker)

**Form.** A simulation is **an HTML widget the agent writes inline in its markdown**
(§3.2), sized and themed from `get_page_context`. That keeps the agent flexible: it can lay out readouts, labels and
explanatory text around the canvas however the concept needs. The renderer hosts it in a
sandboxed iframe and gives it the `@avenire/ui` runtime.

**Threading.**

- The widget's HTML/DOM runs in an opaque-origin sandboxed iframe. On desktop (Electron)
  we enable process isolation for sandboxed iframes (Chromium's `IsolateSandboxedIframes`),
  so even widget DOM work stays off the chat's main thread.
- The **model** (step function, solver, sampler) and **drawing** run in a dedicated
  Worker that the runtime spawns. The canvas is handed over with
  `transferControlToOffscreen()`. The iframe's own thread only handles input and DOM
  readouts.
- The model code shape:

  ```html
  <avenire-sim kit="kinematics" title="Reaching a target">
    <script type="avenire/params">
      { "segments": { "min": 2, "max": 6, "default": 3 },
        "jointLimitDeg": { "min": 10, "max": 180, "default": 120 } }
    </script>
    <script type="avenire/worker">
      export function setup(ctx) { /* runs in the worker */ }
    </script>
    <!-- free-form HTML for layout and readouts -->
  </avenire-sim>
  ```

  `setup(ctx)` receives `ctx.canvas` (OffscreenCanvas 2D/WebGL), `ctx.params` (live
  values), `ctx.loop(fn)` (a frame loop, auto-paused offscreen and under reduced motion),
  `ctx.pointer` and `ctx.handles` (draggable points with hit-testing, events forwarded
  from the iframe), `ctx.theme` (tokens), `ctx.data(name)` (`run_python` outputs and grids),
  and `ctx.emit(name, value)` (readouts bound to DOM elements by `data-readout`).

- **Controls** declared in `avenire/params` render as host-styled native components
  (sliders, toggles, selects) inside the widget. Values cross a **typed, validated
  `postMessage` channel** (a schema per message, exact `targetOrigin`).

**Isolation.** CSP with **no remote script origins**: the host injects a pre-bundled
runtime (the `math` subpaths and the viz kits) through a blob URL / import map, with
`connect-src 'none'`. v1's CDN allowance goes away. There's no link-opening or
message-sending bridge unless the widget declares it as a capability.

**Kits** wrap `context/math` and fill its gaps:

- `kinematics`: FABRIK 2D/3D chains, joint constraints, reachability (from `math/ik` and
  the `example-fabrik-*` demos)
- `mechanics`: springs (`math/time`), an XPBD particle/constraint solver (adapted from
  `example-circle-physics`), RK4 and semi-implicit Euler integrators (added; `math` has no
  ODE module)
- `fields`: vector and scalar fields, flow particles (`math/noise`, `example-flow-field`)
- `geometry`: hulls, triangulation, transforms, quaternions (`math/geometry`, `math` core)
- `stochastic`: seeded RNG, samplers, Monte Carlo helpers, histograms (added)
- `systems`: compartment models (SIR), stock/flow and agent-based stepping (added)
- `plot`: axes, grids, function curves and phase portraits drawn on the canvas, for live
  math a static chart can't express
- `signals`: DFT and Fourier series (added)

**Budgets.** An 8 ms worker frame budget (the loop throttles and warns), memory and
canvas-size caps, a 200 KB source limit, a kill switch after repeated budget violations,
and a poster frame captured headlessly at creation time for embeds and offscreen rows.

**Errors are visible.** Exceptions in the worker or iframe are posted as diagnostics. The
host shows an error state with "ask Ruth to fix" instead of a blank frame.

**Reference simulation: inverse kinematics.** Ruth writes an `<avenire-sim
kit="kinematics">` with parameters `{ segments: 2–6, segmentLength, jointLimitDeg, solver:
"fabrik" | "ccd" }`. The worker code builds a `fabrik2` chain, binds `ctx.handles` to the
target, solves each frame, and emits `reachable` / `iterations` readouts. Ruth's prose
explains why the chain straightens and stalls when the target leaves the reachable disc,
and what joint limits do to the solution space.

### 4.5 Video (Manim, owned by a subagent)

**Who does the work.** The chat Ruth never generates video itself. It calls
`make_video({ objective, audience, sourceChunkIds, constraints })`, which starts a
**video subagent** (its own model context, skills and tools) and returns immediately with
a handle. The chat Ruth keeps talking. The subagent shows in the conversation as a
subagent card (see `docs/design/chat-view.md` §7) with live stage progress.

**Questions to the user come from the subagent.** If the subagent needs input (approve the
scene plan, pick depth or pacing, "focus on the intuition or the proof?"), it raises a
question request. That request is surfaced in the chat's composer banner, labelled as
coming from the video agent, and its answer is routed back to the subagent. The chat Ruth
doesn't relay or paraphrase it. Ruth Cloud runs skip questions and use defaults.

The subagent's pipeline, following animus with the job model, validation and caching it
lacks:

1. **Plan:** a `VideoPlan` of `{ scenes: [{ id, objective, narration, visualIntent,
sourceChunkIds, durationHint }], style, quality }`, optionally confirmed by the user
   through a question request.
2. **Code:** Manim CE source, one `Scene` per planned scene, against an `avenire_manim`
   helper library (theme palette, title cards, equation reveals, axis/graph presets,
   citation lower-thirds) baked into the snapshot.
3. **Job:** a `render_job` row is queued and picked up by a worker (`FOR UPDATE SKIP
LOCKED`, like ingestion). It runs in a **prebaked Daytona snapshot**
   (`avenire-manim:<version>`: Python, Manim CE, LaTeX, ffmpeg, Cairo/Pango, fonts,
   `avenire_manim`, `avenire.mplstyle`), so there's no per-run apt/pip install. One sandbox
   per job, reused across preview, repair and final renders.
4. **Preview render** (`-ql`, 480p15): run, then **sample frames** (scene boundaries,
   start/middle/end) and check them for black or empty frames, text overflowing the safe
   area, and OCR'd text against the plan. A model also critiques a frame contact sheet
   against each scene's objective. Failures become structured diagnostics.
5. **Repair:** the subagent gets the diagnostics (`stage`, `code`, `message`,
   `sourceLocation`, `logTail`, `frameRefs`) and patches the source. After up to 3 attempts
   the job fails with the last diagnostics, and the chat Ruth is told so and can offer a
   chart or text explanation instead.
6. **Final render** (`-qm`/`-qh`) per scene in parallel, concatenated with ffmpeg. The
   outputs are an MP4, a poster frame, per-scene chapters, and **captions (VTT) generated
   from the narration**.
7. **Delivery:** outputs go to storage keyed by content hash, the artifact becomes `ready`,
   and the subagent card turns into a video row. Progress is reported per stage (planned →
   preview → checks → final N/M scenes → uploading), not as a spinner.

**Narration.** Captions are always included. **TTS narration is a paid-tier feature**,
cached by `hash(text, voice, model)`, and synthesized per scene so the audio aligns with
scene boundaries.

**Caching** is layered: the snapshot by dependency manifest; per-scene renders by
`hash(sceneSource, helperVersion, quality)`, so editing one scene re-renders only that
scene; and TTS by narration. **Limits:** a 90 s default for chat videos (5 min for Cloud),
a 10-minute job timeout, and no secrets in the render sandbox.

## 5. Teaching Ruth which modality to use

Prompting alone doesn't make modality choice reliable. Five reinforcing mechanisms:

1. **A planning step the tools enforce.** Before any visual, Ruth must call
   `get_page_context({ plan: { learningObjective, modality, justification, dataSource,
parameters? } })`. The tool validates the plan against the policy:
   - a chart needs a data source;
   - a simulation needs ≥ 2 coupled parameters or a draggable state, and a client tier
     (§4.3) for any parameter backed by `run_python` output;
   - a video needs an ordered sequence.

   It returns either the go-ahead with the matching skill loaded, or a correction ("this
   is a 12-row comparison: use a chart spec"; "this slider would re-run the sandbox: use a
   precomputed grid").

2. **Skills per modality**, generated from Markdown like v1's
   (`packages/ai/skills/sections/*`). A short router skill (the §2 table and tie-breakers)
   is always loaded. On-demand modality skills contain:
   - the spec references;
   - the `avenire` / `avenire_manim` / `@avenire/ui` APIs;
   - **templates adapted from `context/math/examples`** (FABRIK 2D/3D, springs, flow field,
     XPBD, convex hull);
   - animus's Manim craft rules (layout safety, contrast, low object count, pacing). These
     go to the video subagent's skills only.
3. **Validators that make the wrong choice cost something:**
   - spec schemas and size budgets;
   - a "spec-expressible" detector for chart-like simulation code;
   - numeric provenance checks (chart values must trace to a `dataRef` or
     `sourceChunkIds`);
   - lint rules on simulation code: no network, no DOM access from worker code, no heavy
     loops on the iframe thread, cleanup on teardown.
4. **A modality eval set** in `packages/ruth-evals`: 100+ grounded prompts labelled with
   acceptable modalities, run on every prompt or skill change. It tracks modality accuracy,
   render success rate, repair attempts and cost per artifact.
5. **Product feedback:** PostHog events (`artifact_viewed`, `artifact_interacted` with
   dwell and parameter changes, `artifact_regenerated` with the reason,
   `artifact_added_to_note`, `artifact_shared`) feed real failures into the eval set.

## 6. Security model

| Surface          | Boundary                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python / Manim   | Ephemeral or job-scoped Daytona sandbox; no secrets; network disabled after the snapshot; CPU, memory and time caps; outputs only via the `avenire` helper                                                                      |
| Simulation       | Opaque-origin sandboxed iframe (process-isolated on desktop), model code in a worker with no network, CSP without remote origins, host-bundled runtime, typed `postMessage` with schemas and exact origins, capability manifest |
| Shared artifacts | Opt-in per artifact; signed public URL; served from a separate origin with the same CSP and runtime; no capabilities                                                                                                            |
| Text / chart     | No code; schema-validated; sanitized text; node and size limits                                                                                                                                                                 |
| Storage          | Content-addressed outputs, signed URLs, artifacts scoped to the user                                                                                                                                                            |

## 7. Packages and contracts

- `@avenire/contracts`: `Artifact`, `ChartSpec`, `VideoPlan`, `Diagnostic`, and render-job
  status (extending today's `Artifact` / `ArtifactKind`).
- `@avenire/ui` (`widget-frame` and React-free `widget-protocol` today; planned additions):
  - the simulation runtime (iframe host, worker bootstrap, kits wrapping `math`);
  - the chart worker;
  - host React components: `<AvenireVis>`, figure cards, chart overlay, video player.
- `@avenire/cloud`: `Sandboxes.runPython` (structured outputs) and a `RenderJobs` worker
  for Manim.
- `@avenire/ai` (on the Vercel AI SDK):
  - tools: `get_page_context`, `run_python`, and `make_video` (starts the video subagent).
    Charts and simulations need no tool; they're inline markdown;
  - the subagent runtime;
  - the skills bundle.
- Snapshot images (`infra/snapshots/`): `avenire-python` (scientific stack, `avenire`
  helper, mplstyle) and `avenire-manim`.

## 8. Phasing

1. **Foundation:**
   - inline widget tags, `get_page_context`, and promotion to stored artifacts;
   - text rendering and the chart worker with the shadcn overlay;
   - plan validation in `get_page_context` and the router skill;
   - the modality eval set (an initial 50 prompts).
2. **`run_python`:** the Python snapshot, the `avenire` helper, SVG figure cards, data
   outputs feeding charts.
3. **Simulation:**
   - the `@avenire/ui` iframe + worker runtime;
   - the kinematics, mechanics, stochastic and plot kits;
   - grid handoff from `run_python`;
   - IK, spring, SIR and Monte Carlo reference templates.
4. **Video:** the subagent runtime, render jobs, the Manim snapshot, preview → checks →
   repair → final, and captions.
5. **Polish:**
   - revisions UI;
   - note and notebook embedding;
   - share links;
   - Pyodide tier;
   - paid TTS;
   - Cloud budgets;
   - the feedback loop into evals.

## 9. Open questions

- Frame-critique model and budget per video.
- Pyodide tier: worth the ~10 MB first load, or are grids plus JS models enough?
- How far to let `run_python` emit simulation scaffolds directly (sweep → auto-generated
  controls and grid binding).
- Share links: should a shared simulation keep live parameters (yes, by default), and do
  shared videos need watermarking?
