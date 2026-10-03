# Widget Renderer 2.0 — vision

How Ruth explains things *visually*. In v1 a "widget" meant one thing: model-written
HTML/JS in an iframe (plus a small primitive spec). In 2.0 the widget is a **typed artifact
in one of several modalities**, and choosing the right modality is a first-class part of
Ruth's reasoning.

Inputs to this document: the v1 renderer (`context/avenire/apps/web/src/components/Widget*`,
`packages/ai/skills/sections/visual-guidelines`), the Ruth research prototype
(`context/research/ruth`), `context/math` (pmndrs/math), and `context/animus` (Manim agent).
Research notes: `context/_notes/{v1-widgets,math,animus}.md`.

---

## 1. Principles

1. **The modality is a teaching decision, not a rendering detail.** Ruth picks how to show
   something from what the learner needs to *do* with it: compare, follow, compute, or
   manipulate.
2. **Prose always wraps the visual.** Every artifact has a one-line learning objective,
   a caption, and an accessible text fallback. A visual never replaces the explanation.
3. **Grounded in the user's material.** Artifacts carry `sourceChunkIds`, and numbers come
   from the material or from computation, never from the model's imagination.
4. **Declarative first, code last.** Use a data spec when one fits (charts, layouts).
   Model-written code is reserved for what specs can't express, and always runs isolated.
5. **Durable, versioned documents.** An artifact is a stored, schema-versioned record with
   provenance and re-renderable sources, not an opaque HTML blob pasted into a note.
6. **Expensive things are jobs.** Videos and long simulations render asynchronously with
   progress, caching and repair. Chat never blocks on them.

## 2. The modality policy

This is the rule set Ruth is trained and validated against. It encodes the owner's three
rules plus the cheap defaults around them.

| The concept is… | Use | Why | Not |
| --- | --- | --- | --- |
| **A large amount of raw information**: many values, categories, time series, comparisons, distributions | **Chart** (declarative spec) | The value is in seeing the shape of the data; charts are cheap, accessible and exact | Custom canvas code for something a bar/line/scatter covers |
| **A large amount of raw information with an ordered story**: a process, a derivation, a history, "how X leads to Y" | **Video** (Manim, rendered in the sandbox) | Narrated, controlled reveals carry dense sequential information better than a static view | A wall of text, or an interactive the learner has to drive |
| **Heavily mathematical, with many parts that need brute force**: enumeration, Monte Carlo, parameter sweeps, numerical solutions, statistics over generated data | **Simulation** (Python data experiment in the sandbox) | Real computation produces trustworthy numbers; results become charts and figures | Hand-waved numbers, or JS approximations in the browser |
| **Many moving parts that together determine the outcome**: linkages, inverse kinematics, mechanical systems, fields, feedback loops, geometry under constraints | **Interactive** (canvas built on `context/math`) | The insight comes from manipulating the inputs and watching the coupled system respond | A video, which can't be poked |
| A single formula, definition, small table or comparison | **Inline** (markdown + KaTeX + a layout primitive) | Anything heavier is noise | Any of the above |

Tie-breakers:
- Prefer the **cheapest modality that teaches the point** (inline < chart < simulation <
  interactive < video in cost).
- Simulation and interactive **compose**: a sweep produces data, data becomes a chart,
  and a parameter that matters becomes a slider.
- If the learner says "show me how it moves" → interactive; "walk me through" → video;
  "how often / how likely / what if we tried all" → simulation; "compare / trend" → chart.
- On mobile, interactives degrade to a poster plus "open on desktop"; videos and charts
  work everywhere.

### Worked examples

| Prompt (grounded in the user's notes) | Modality |
| --- | --- |
| "How did CO₂ and temperature move together over the last century?" (data table in a PDF) | Chart: dual-axis line from the extracted table |
| "Explain how backpropagation computes gradients" | Video: layer-by-layer reveal of the chain rule |
| "What's the probability two people share a birthday in a class of 30?" | Simulation: Monte Carlo over 100k trials beside the closed form, convergence chart |
| "How does a robot arm reach a point? Why does it get stuck?" | Interactive: FABRIK chain with a draggable target, joint-limit sliders, an "unreachable" state |
| "Eigenvectors of a 2×2 matrix" | Interactive (drag matrix columns, watch the invariant directions) plus inline math |
| "Compare sorting algorithms on random vs. sorted input" | Simulation (timed runs) feeding a chart |
| "Define entropy" | Inline |

## 3. The artifact document

Every visual is one record, stored in the DB (index, provenance) with its payload in
object storage. The contract lives in `@avenire/contracts`:

```ts
type Modality = "inline" | "chart" | "simulation" | "interactive" | "video";

interface Artifact {
  id: ArtifactId;
  schemaVersion: 2;
  modality: Modality;
  title: string;
  learningObjective: string;              // "See why the chain stops when the target is out of reach"
  caption: string;
  altText: string;                         // accessible description; also the mobile/low-power fallback
  sourceChunkIds: ChunkId[];               // provenance into the user's material
  status: "planned" | "rendering" | "ready" | "failed";
  spec: ChartSpec | SimulationSpec | InteractiveSpec | VideoSpec | InlineSpec;  // discriminated by modality
  outputs: ArtifactOutput[];               // stored files: svg/png/mp4/vtt/json data/poster
  diagnostics?: Diagnostic[];              // last failure, structured (see §5.5)
  parentArtifactId?: ArtifactId;           // revisions ("make the arm longer")
}
```

- **Revisions, not overwrites:** "make it slower" creates a child artifact, so notes and
  canvas embeds that reference the old version stay stable.
- **Embedding:** notes and canvas nodes reference `ArtifactId` (no base64 HTML). The
  renderer resolves the latest `ready` output, or shows the poster while rendering.
- **Cloud runs** reuse the same document. A nightly run can produce longer videos and
  heavier simulations because nobody is waiting.

## 4. Rendering, per modality

### 4.1 Inline

Markdown + KaTeX + a small primitive set carried over from v1's spec catalog (`stat`,
`table`, `callout`, `card`, `grid`), adding `equation` (KaTeX) and `steps` (numbered
derivation). Rendered as native React, no iframe. Schema-validated with node-count, depth
and size limits.

### 4.2 Chart (declarative)

- `ChartSpec` is a **Vega-Lite-like subset**: `mark` (bar, line, area, point, rule, arc,
  boxplot, heatmap), `encoding` (x/y/color/size with field, type, aggregate), `transform`
  (filter, aggregate, bin), plus `data` as inline rows (≤ 5k) or a `dataRef` to a stored
  JSON output (for example, a simulation's results).
- Rendered natively with the host theme tokens, an accessible data table toggle, and a
  "copy data" action. No model code.
- The validator rejects chart-shaped requests implemented as interactive code
  ("use a chart spec").

### 4.3 Simulation (Python data experiments)

Runs in the ephemeral Daytona sandbox (`@avenire/cloud/sandbox`).

- `SimulationSpec`: `{ code, entrypoint?, parameters: ParamSchema[], seed, budget: { seconds, memoryMb }, outputs: ("figures" | "table" | "data" | "stdout")[] }`.
- **Contract with the code:** a tiny `avenire` helper module, baked into the sandbox
  snapshot, gives the code structured outputs instead of scraping stdout:
  `avenire.table(df, title)`, `avenire.data(name, rows)` (→ becomes a chart `dataRef`),
  `avenire.figure(fig, caption)`, `avenire.metric(label, value)`.
- **Small matplotlib widgets:** figures render as **SVG** (crisp at any size,
  theme-matched) with a PNG fallback, using an `avenire.mplstyle` baked into the snapshot
  that maps the host theme (font, ink, accent palette, transparent background). In chat
  they show as compact *figure cards* (max ~360px tall) with a caption and "open full".
  Matplotlib is for **static** results; if a figure needs interaction, emit `avenire.data`
  and let Ruth turn it into a chart or interactive instead.
- **Parameters:** declared `parameters` render as host-side controls under the result.
  Changing one re-runs the simulation (debounced, cached by `hash(code, params, seed,
  runtimeVersion)`), so sweeps feel interactive without shipping Python to the browser.
- Determinism: seeded RNG enforced; results are reproducible and therefore cacheable.

### 4.4 Interactive (canvas on `context/math`)

The browser runtime, packaged as **`@avenire/viz`**, gives Ruth a safe, capable kit
instead of a blank iframe.

- **Isolation:** sandboxed iframe (`sandbox="allow-scripts"`, opaque origin), strict CSP
  with **no remote script origins**: the host injects a pre-bundled runtime (`math`
  subpaths + the viz kit) via a blob URL / import map. `connect-src 'none'`. v1's CDN
  allowance goes away.
- **Model code shape:** an ES module exporting `setup(ctx)`, which receives
  `ctx.canvas` (2D/WebGL), `ctx.params` (live values), `ctx.loop(fn)` (frame loop,
  auto-paused offscreen and under reduced motion), `ctx.handles` (draggable points with
  hit-testing), `ctx.theme` (tokens), and `ctx.emit(name, value)` (readouts).
- **Controls live in the host**, not in the iframe: `InteractiveSpec.parameters` declares
  sliders, toggles and selects, rendered as accessible native components. Values cross a
  **typed, validated `postMessage` channel** (schema per message, exact `targetOrigin`,
  no `openLink`/`sendMessage` bridge unless declared as a capability).
- **Kits** wrap `context/math` and fill its gaps:
  - `kinematics`: FABRIK 2D/3D chains, joint constraints, reachability (from
    `math/ik` and the `example-fabrik-*` demos)
  - `mechanics`: springs (`math/time`), an XPBD particle/constraint solver (adapted from
    `example-circle-physics`), RK4 / semi-implicit Euler integrators (added; `math` has no
    ODE module)
  - `fields`: vector and scalar fields, flow particles (`math/noise`,
    `example-flow-field`)
  - `geometry`: hulls, triangulation, transforms, quaternions (`math/geometry`, `math`
    core)
  - `plot`: axes, grids, function curves and phase portraits drawn on the canvas, for
    live math that a static chart can't express
  - `signals`: DFT and Fourier series (added)
- **Budgets:** an 8 ms frame budget (the loop throttles and warns when exceeded), memory
  and canvas-size caps, a 200 KB source limit, a kill switch after repeated frame-budget
  violations, and a static poster captured headlessly at render time as the fallback.
- **Errors are visible:** runtime exceptions are caught in-frame and posted as
  diagnostics; the host shows an error state with "ask Ruth to fix" instead of a blank
  frame.

**Reference interactive: inverse kinematics.** Ruth emits an `InteractiveSpec` with
`kit: "kinematics"`, parameters `{ segments: 2–6, segmentLength, jointLimitDeg,
solver: "fabrik" | "ccd" }`, and code that builds a `fabrik2` chain, binds `ctx.handles`
to the target, solves each frame, and emits `reachable` / `iterations` readouts. Ruth's
caption explains why the chain straightens and stalls when the target leaves the
reachable disc, and what joint limits do to the solution space.

### 4.5 Video (Manim in the sandbox)

Following animus, with the async job pipeline, validation and caching it lacks:

1. **Plan:** Ruth emits a `VideoSpec` first: `{ scenes: [{ id, objective, narration,
   visualIntent, sourceChunkIds, durationHint }], style, quality }`. In interactive chat
   the plan is shown for a quick approve/tweak (like animus's `finalizeVideoPlan`);
   Ruth Cloud skips approval.
2. **Code:** Ruth writes Manim CE source, one `Scene` per spec scene, against an
   `avenire_manim` helper library (theme palette, title cards, equation reveals,
   axis/graph presets, citation lower-thirds) baked into the snapshot.
3. **Job:** a `render_job` row is queued and picked up by the worker
   (`FOR UPDATE SKIP LOCKED`, like ingestion). The job runs in a **prebaked Daytona
   snapshot** (`avenire-manim:<version>`: Python, Manim CE, LaTeX, ffmpeg, Cairo/Pango,
   fonts, `avenire_manim`, `avenire.mplstyle`), so there is no per-run apt/pip install.
4. **Preview render** (`-ql`, 480p15): run, then **sample frames** (scene boundaries,
   start/middle/end) and check them: black or empty frames, text overflow outside the
   safe area, OCR of rendered text against the spec, and a model critique of a frame
   contact sheet against each scene's objective. Failures become structured diagnostics.
5. **Repair:** Ruth gets the diagnostics (`stage`, `code`, `message`, `sourceLocation`,
   `logTail`, `frameRefs`) and patches the source. Up to 3 attempts, then the job fails
   with the last diagnostics and Ruth falls back to a chart or inline explanation.
6. **Final render** (`-qm`/`-qh`) per scene in parallel, concatenated with ffmpeg; outputs
   are an MP4, a poster frame, per-scene chapters, and **captions (VTT) generated from the
   narration**. Optional TTS narration is cached by `hash(text, voice, model)`.
7. **Delivery:** outputs are uploaded to storage keyed by content hash, the artifact
   becomes `ready`, and the chat or Cloud card updates through the synced item stream.
   Progress is reported per stage (planned → preview → checks → final N/M scenes →
   uploading), not as a spinner.

Caching is layered: snapshot by dependency manifest; per-scene render by
`hash(sceneSource, helperVersion, quality)`, so editing one scene re-renders only that
scene; and TTS by narration. Limits: a 90 s default for chat videos (5 min for Cloud),
a 10-minute job timeout, and secrets never present in the render sandbox.

## 5. Teaching Ruth which modality to use

Prompting alone doesn't make modality choice reliable. Five reinforcing mechanisms:

1. **A planning step the tools enforce.** Before any visual, Ruth must call
   `plan_visual({ learningObjective, modality, justification, dataSource })`. The tool
   validates the plan against the policy: modality-specific checks (a chart needs a data
   source; a simulation needs computation or randomness; an interactive needs ≥ 2 coupled
   parameters or a draggable state; a video needs an ordered sequence). It returns either
   the go-ahead with the matching skill loaded, or a correction ("this is a 12-row
   comparison: use a chart spec").
2. **Skills per modality**, generated from Markdown like v1's
   (`packages/ai/skills/sections/*`): a short router skill (the §2 table and tie-breakers,
   always loaded) plus on-demand modality skills containing spec references, the
   `avenire` / `avenire_manim` / `@avenire/viz` APIs, and **templates adapted from
   `context/math/examples`** (FABRIK 2D/3D, springs, flow field, XPBD, convex hull) and
   from animus's Manim craft rules (layout safety, contrast, low object count, pacing).
3. **Validators that make the wrong choice cost something:** spec schemas, size budgets,
   a "spec-expressible" detector for chart-like interactive code, numeric provenance
   checks (chart values must trace to `dataRef` or `sourceChunkIds`), and lint rules on
   interactive code (no network, no DOM outside `ctx.canvas`, cleanup on teardown).
4. **A modality eval set** in `packages/retrieval-benchmark` (or a sibling
   `packages/ruth-evals`): 100+ grounded prompts labelled with an acceptable modality,
   run on every prompt or skill change. Track modality accuracy, render success rate,
   repair attempts and cost per artifact.
5. **Product feedback:** PostHog events (`artifact_viewed`, `artifact_interacted` with
   dwell and parameter changes, `artifact_regenerated` with the reason,
   `artifact_added_to_note`) feed the eval set with real failures.

## 6. Security model

| Surface | Boundary |
| --- | --- |
| Python / Manim | Ephemeral or job-scoped Daytona sandbox; no secrets; network disabled after the snapshot; CPU, memory and time caps; outputs only via the `avenire` helper |
| Interactive JS | Opaque-origin iframe, CSP without remote origins, host-bundled runtime, typed `postMessage` with schemas and exact origins, capability manifest (no links or messages unless declared and confirmed) |
| Inline / chart | No code; schema-validated; sanitized text; node and size limits |
| Storage | Content-addressed outputs, signed URLs, artifacts scoped to the user |

## 7. Packages and contracts

- `@avenire/contracts`: `Artifact`, the per-modality specs, `Diagnostic`, and render-job
  status events (extending today's `Artifact` / `ArtifactKind`).
- `@avenire/viz` (new): the iframe runtime, kits wrapping `math`, the host bridge, and
  host-side React components (`<ArtifactView>`, controls, figure cards, video player).
- `@avenire/cloud`: `Sandboxes.runSimulation` (structured outputs) and a `RenderJobs`
  worker for Manim.
- `@avenire/ai`: the `plan_visual` tool, per-modality tools (`make_chart`,
  `run_simulation`, `make_interactive`, `make_video`), and the skills bundle.
- Snapshot images (`infra/snapshots/`): `avenire-python` (scientific stack, `avenire`
  helper, mplstyle) and `avenire-manim`.

## 8. Phasing

1. **Foundation:** the artifact document and storage, inline and chart renderers,
   `plan_visual` plus the router skill, and the modality eval set (initial 50 prompts).
2. **Simulation:** Python snapshot, `avenire` helper, SVG figure cards, cached parameter
   re-runs.
3. **Interactive:** the `@avenire/viz` runtime with the kinematics, mechanics and plot
   kits; IK, spring and field reference templates.
4. **Video:** render jobs, the Manim snapshot, preview → checks → repair → final, and
   captions.
5. **Polish:** revisions UI, note and canvas embedding, Cloud budgets, the feedback loop
   into evals.

## 9. Open questions

- Chart renderer: build on Vega-Lite itself (bigger, battle-tested) or a Recharts-backed
  subset (smaller, matches v1)? Leaning Vega-Lite with a schema-restricted subset.
- Should interactives be exportable as standalone HTML (share links), and how does that
  affect the capability model?
- TTS narration in chat videos by default, or captions only (cost and latency)?
- Frame critique model and budget per video.
- How far to go in letting Python write interactive specs directly (sweep →
  auto-generated sliders).
