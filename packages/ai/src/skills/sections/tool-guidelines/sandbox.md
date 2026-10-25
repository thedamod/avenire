---
name: sandbox
description: Use sandbox tools for real computation, data processing, matplotlib and manimgx media, and KiCad exports.
---

# Sandbox

Use the Daytona thread sandbox for computation and shareable files. Python 3 scientific packages, matplotlib, pandas/openpyxl, manimgx, `kicad-cli`, Node and pnpm are available. Treat it as ephemeral; keep source and output paths explicit. Never claim a render, calculation or export succeeded until you inspect its command output and file.

The working directory is `/home/daytona/work`. Prefer relative paths such as `afterburner.html`; absolute writes must stay under `/home/daytona` or `/tmp`. `/mnt`, `/mnt/data` and local host paths are unavailable. Keep the same sandbox path through write, build, preview and render. `/opt/avenire/figures` is a read-only source reference; copy sources into the working directory before editing or building.

1. `sandbox_write({ path: "work.py", content: "..." })` writes code/data.
2. `sandbox_exec({ command: "python work.py" })` computes; inspect exit status and concise stdout/stderr. Use the tool's supported timeout for long renders and stay within output caps. Break long jobs into inspect and final render stages.
3. `sandbox_read` reads text or bounded file content; inspect files with scripts (`file`, image dimensions, CSV row count) before publishing. For charts, print JSON aggregates and embed them into widget HTML.
4. `publish_asset({ path: "figure.png", title: "..." })` uploads PNG/SVG/GIF/MP4/PDF/HTML and returns a permanent `{assetId,url}` for chat. Explain what it shows and cite source data. Do not use the URL inside a widget under `connect-src 'none'`.
5. Call `sandbox_close` after the work is complete, except while waiting for needed user input; close after that follow-up.

For large visualizations, build an HTML file with `sandbox_exec` and pass the same file path to `preview_widget({ path: "visualization.html" })` and `render_widget({ title: "...", path: "visualization.html" })`. Inline HTML is capped at 512,000 bytes; a built widget supports 8 MiB. There is no 2 MiB widget cap. Write a concise generator or build script when the finished page is too large for one model/tool argument. Keep the finished HTML out of model context; inspect its byte size and preview report instead. Sandbox files go directly to preview and storage, so increasing UploadThing's source-upload limit is unnecessary.

## Matplotlib and spreadsheets

Select Agg before pyplot. Use Avenire light/dark colours copied from the current `style` tokens into the script. Set a restrained `axes.edgecolor`, `grid.color`, font sizes, and `lines.linewidth` (~1–1.5 pt) through `rcParams`; export at readable dimensions/DPI. Example:

```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams.update({'figure.facecolor':'#faf9f5','axes.facecolor':'#faf9f5',
                     'axes.edgecolor':'#b4b0a9','grid.color':'#d7d3cc',
                     'axes.linewidth':0.6,'lines.linewidth':1.2,'font.size':10})
fig, ax = plt.subplots(figsize=(7, 4), layout='constrained')
ax.plot([1,2,3], [2,3,5], color='#6050a5')
ax.grid(alpha=.5)
fig.savefig('figure.png', dpi=180)
fig.savefig('figure.svg')
```

For CSV/XLSX: `pd.read_csv` or `pd.read_excel(engine='openpyxl')`; inspect dtypes, parse dates, coerce numbers with an explicit missing-value policy, group and aggregate, then export compact `to_json(orient='records', date_format='iso')`. Avoid dumping private rows into tool output. Animate GIFs with matplotlib `PillowWriter` or `imageio`; MP4 with `FFMpegWriter` if ffmpeg is present. Check output size and a sample frame.

## ManimGX, KiCad, Node

Use `import manimgx as m`, `class SceneName(m.Scene)`, and `manimgx inspect scene.py` first. Inspect writes a timeline, checks sampled 2D layout, and a storyboard PNG; inspect the storyboard and fix overlap before final render. Draft with `manimgx render scene.py SceneName -r 1280x720 --fps 30`; keep scenes short, then render final size. ManimGX uses built-in Typst conversion for `MathTex`/`Tex`: do not install LaTeX, Manim CE or ffmpeg for it. Use time-based state, not frame counting. Its CE-compatible APIs and differences are documented at https://manimgx.academa.ai/llms.txt and https://manimgx.academa.ai/user-guide/coming-from-manim-ce/index.md.

Use `kicad-cli sch export svg|pdf` or `kicad-cli pcb export svg|pdf|gerbers` on the actual design, inspect CLI help for exact options, and publish the generated file. For Node scripts, write then run with `node` or `pnpm`, capture bounded output, and publish only useful artifacts. Do not install packages just to make an ordinary chart.
