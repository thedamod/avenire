---
name: sandbox
description: Use sandbox tools for real computation, data processing, matplotlib and manimgx media, and KiCad exports.
---

# Sandbox

Use the Daytona thread sandbox for computation and shareable files. Python 3 scientific packages, matplotlib, pandas/openpyxl, manimgx, `kicad-cli`, Node and pnpm are available. Treat it as ephemeral; keep source and output paths explicit. Never claim a render, calculation or export succeeded until you inspect its command output and file.

The working directory is `/home/daytona/work`. Prefer relative paths such as `afterburner.html`; absolute writes must stay under `/home/daytona` or `/tmp`. `/mnt`, `/mnt/data` and local host paths are unavailable. Keep the same sandbox path through write, build, preview and render. `/opt/avenire/figures` is a read-only source reference; copy sources into the working directory before editing or building.

In Ava Cloud, use the run output directory and `box_write` / `box_exec` / `box_read` instead of the chat sandbox tools. `preview_widget` reads Cloud paths, and `publish_output` / `publish_asset` publish HTML as a wrapped widget. The executor closes the persistent workspace; do not call `sandbox_close` or `render_widget` in Cloud.

1. `sandbox_write({ path: "work.py", content: "..." })` writes code/data.
2. `sandbox_exec({ command: "python work.py" })` computes; inspect exit status and concise stdout/stderr. Use the tool's supported timeout for long renders and stay within output caps. Break long jobs into inspect and final render stages.
3. `sandbox_read` reads text or bounded file content; inspect files with scripts (`file`, image dimensions, CSV row count) before publishing. For charts, print JSON aggregates and embed them into widget HTML.
4. `publish_asset({ path: "figure.png", title: "..." })` uploads PNG/SVG/GIF/MP4/PDF/HTML and returns a permanent `{assetId,url}` for chat. Explain what it shows and cite source data. Do not use the URL inside a widget under `connect-src 'none'`.
5. Call `sandbox_close` after the work is complete, except while waiting for needed user input; close after that follow-up.

For large visualizations, build an HTML file with `sandbox_exec` and pass the same file path to `preview_widget({ path: "visualization.html" })` and `render_widget({ title: "...", path: "visualization.html" })`. Inline HTML is capped at 512,000 bytes; a built widget supports 8 MiB. There is no 2 MiB widget cap. Write a concise generator or build script when the finished page is too large for one model/tool argument. Keep the finished HTML out of model context; inspect its byte size and preview report instead. Sandbox files go directly to preview and storage, so increasing UploadThing's source-upload limit is unnecessary.

## Matplotlib and spreadsheets

Load `style` and call `get_page_context` before rendering. Select Agg before pyplot. Use the current figure tokens for every surface, mark and label. Ordinary series use neutral ink, labelled or dashed; reserve semantic red/green/blue for actual signals. Use square framing and thin axes, restrained typography, and readable export dimensions/DPI. Never use a library's default categorical palette or an unrelated custom dark theme.

Cloud's `get_page_context` returns `themeFile`: an absolute path to the server-written `visual-theme.json` beside the run's `out` directory. It has `themes.light` and `themes.dark`, each with `tokens`, neutral `series`, and ready-to-use `matplotlib` rcParams derived from the same production widget tokens. Read it from the script, select the requested appearance (dark by default; the app is dark first), and use `plt.rcParams.update(theme['matplotlib'])` plus `plt.rcParams['axes.prop_cycle'] = cycler(color=theme['series'])`. Use these values for diagrams as well as charts. Do not overwrite them with an invented palette later in the script. Cloud also installs the dark palette as the default `matplotlibrc`, so an unstyled plot is already on-palette; never reset it with `plt.style.use` or seaborn themes.

For chat, save `get_page_context().themeTokens` as `figure-tokens.json` in the script directory before running this example. In Cloud, replace the token-loading expression with `json.loads(theme_file.read_text())['themes'][appearance]['tokens']`, using the returned `themeFile` path. This plots supplied `series.csv` data rather than fabricated observations:

```python
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
from cycler import cycler

root = Path(__file__).resolve().parent
tokens = json.loads((root / 'figure-tokens.json').read_text())
plt.rcParams.update({
    'figure.facecolor': tokens['--figure-page'],
    'axes.facecolor': tokens['--figure-card'],
    'savefig.facecolor': tokens['--figure-page'],
    'text.color': tokens['--figure-strong'],
    'axes.labelcolor': tokens['--figure-text'],
    'xtick.color': tokens['--figure-text'],
    'ytick.color': tokens['--figure-text'],
    'axes.edgecolor': tokens['--figure-mid'],
    'grid.color': tokens['--figure-faint'],
    'axes.linewidth': 0.45, 'grid.linewidth': 0.45,
    'lines.linewidth': 1.125, 'font.size': 10,
    'legend.frameon': False,
    'axes.prop_cycle': cycler(color=[tokens['--figure-hi'], tokens['--figure-mid']]),
})
data = pd.read_csv(root / 'series.csv')
fig, ax = plt.subplots(figsize=(7, 4), layout='constrained')
ax.plot(data['x'], data['y'], label='Observed')
ax.spines[['top', 'right']].set_visible(False)
ax.grid(True)
ax.legend()
fig.savefig(root / 'figure.png', dpi=180)
fig.savefig(root / 'figure.svg')
plt.close(fig)
```

For CSV/XLSX: `pd.read_csv` or `pd.read_excel(engine='openpyxl')`; inspect dtypes, parse dates, coerce numbers with an explicit missing-value policy, group and aggregate, then export compact `to_json(orient='records', date_format='iso')`. Avoid dumping private rows into tool output. Animate GIFs with matplotlib `PillowWriter` or `imageio`; MP4 with `FFMpegWriter` if ffmpeg is present. Check output size and a sample frame.

## Video appearance

Videos use the same selected figure theme on every frame. Load the renderer palette once, then use its `--figure-page`, `--figure-card`, `--figure-strong`, `--figure-text`, `--figure-mid` and neutral series values in Pillow/ImageDraw, matplotlib animation, manimgx scene backgrounds/text/strokes, or Node rendering. Use square hairline panels, concise technical labels and the same model for motion and readouts. A controller identity is a label/dash/shape, not a reason for teal/orange colouring; a failed state can use semantic red. Never introduce a separate video design system.

For Cloud Pillow frames, for example, use `Image.new('RGB', (width, height), theme['tokens']['--figure-page'])`, and draw labels with `theme['tokens']['--figure-strong']`. For manimgx, set scene background and all mark/text colours from those same selected tokens. Explicitly label the exported appearance in filenames, such as `comparison-light.mp4`; when both are required, render each palette into its own file. PNG and MP4 pixels cannot follow live CSS theme messages. Inspect representative frames at the beginning, middle and end unless the task waives verification.

In Cloud, `publish_output`, `publish_report` and `publish_asset` check each rendered file before publishing: images and sampled video frames need a figure-page/card background and no off-palette hues (teal, orange, yellow, purple…) or tinted navy/slate surfaces, and HTML may not contain colour literals other than black, white and transparent. A rejection names the problem; re-render and publish again. Screenshots or photos you did not render go under a `captures/` folder and are published as they are.

## ManimGX, KiCad, Node

Use `import manimgx as m`, `class SceneName(m.Scene)`, and `manimgx inspect scene.py` first. Inspect writes a timeline, checks sampled 2D layout, and a storyboard PNG; inspect the storyboard and fix overlap before final render. Draft with `manimgx render scene.py SceneName -r 1280x720 --fps 30`; keep scenes short, then render final size. ManimGX uses built-in Typst conversion for `MathTex`/`Tex`: do not install LaTeX, Manim CE or ffmpeg for it. Use time-based state, not frame counting. Its CE-compatible APIs and differences are documented at https://manimgx.academa.ai/llms.txt and https://manimgx.academa.ai/user-guide/coming-from-manim-ce/index.md.

Use `kicad-cli sch export svg|pdf` or `kicad-cli pcb export svg|pdf|gerbers` on the actual design, inspect CLI help for exact options, and publish the generated file. For Node scripts, write then run with `node` or `pnpm`, capture bounded output, and publish only useful artifacts. Do not install packages just to make an ordinary chart.
