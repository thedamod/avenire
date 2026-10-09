---
name: python
description: Use sandbox tools for real computation - brute force, statistics, symbolic math and data processing over the user's material. Load before the first sandbox call.
---

# Python

One ephemeral Linux sandbox persists per thread, with Python 3.12, numpy, scipy,
pandas, sympy, matplotlib, Manim, ffmpeg and LaTeX preinstalled. Network is blocked;
write scripts and data locally. The hard lifetime cap is 60 minutes; each command
has a 120-second default timeout and a maximum of 900 seconds.

Use it for enumeration, Monte Carlo, parameter sweeps, numerical solutions,
statistics and checked symbolic math. Prefer prose for answers you can give exactly.

1. `sandbox_write({ path: "analysis.py", content: "..." })` writes the script.
2. `sandbox_exec({ command: "python analysis.py" })` runs it. Seed randomness,
   print labelled results and keep output concise (64 KB maximum).
3. Save figures or data to files explicitly, then call
   `sandbox_download_artifact({ path: "figure.png" })`. Downloads expire after seven days.
   For Manim, render with `manim -ql scene.py SceneName` and download the resulting MP4.
4. Use `sandbox_read` for text or `encoding: "base64"` for binary files (up to 1 MB).
5. Call `sandbox_close` when the task is done unless waiting for the user's input.
   After that follow-up, close it.

If a command fails, read the output and fix the cause before retrying. Explain any
remaining limitation. Never invent results. For interactive exploration, pass computed
data into a standalone HTML document via `render_widget`; do not re-run Python per slider.
