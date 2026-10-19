---
name: chart-from-spreadsheet
description: Read a spreadsheet with pandas, aggregate a dated series, embed JSON, and draw a plain SVG trend.
---

# Spreadsheet trend example

In the sandbox, inspect columns before choosing the date and value fields. This illustrative command works for a sheet with `date` and `value` columns; use the real source's names and units. Replace the embedded demonstration JSON with the printed aggregate, then preview the widget.

```python
import json
import pandas as pd
rows = pd.read_excel('source.xlsx', engine='openpyxl')
print(rows.dtypes.to_string())
rows['date'] = pd.to_datetime(rows['date'], errors='coerce')
rows['value'] = pd.to_numeric(rows['value'], errors='coerce')
rows = rows.dropna(subset=['date','value'])
monthly = rows.groupby(rows['date'].dt.to_period('M'))['value'].mean().reset_index()
monthly['date'] = monthly['date'].astype(str)
print(json.dumps(monthly.to_dict(orient='records'), separators=(',',':')))
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body {
        margin: 0;
        font: var(--text-base)/var(--leading-normal) var(--font-sans);
        color: var(--foreground);
      }
      figure {
        margin: auto;
        max-width: 700px;
        padding: var(--space-4);
        border: var(--stroke-hairline) solid var(--figure-frame);
        border-radius: var(--radius);
        background: var(--card);
      }
      h2 {
        margin: 0;
        font-size: var(--text-lg);
      }
      p,
      figcaption {
        font-size: var(--text-sm);
        color: var(--muted-foreground);
      }
      svg {
        width: 100%;
        height: auto;
        display: block;
      }
      .rule {
        stroke: var(--figure-leader);
        stroke-width: var(--stroke-hairline);
      }
      .label {
        fill: var(--figure-label);
        font: calc(var(--figure-label-size) * 1.3) var(--font-sans);
      }
    </style>
  </head>
  <body>
    <figure>
      <h2>Monthly average · example index</h2>
      <p>Index units. Replace the embedded values and unit with the spreadsheet aggregate.</p>
      <svg
        id="plot"
        viewBox="0 0 480 260"
        role="img"
        aria-label="Monthly trend in index units"
      ></svg>
      <figcaption id="caption"></figcaption>
    </figure>
    <script type="module">
      const rows = [
        { date: "2026-01", value: 21 },
        { date: "2026-02", value: 24 },
        { date: "2026-03", value: 22 },
        { date: "2026-04", value: 29 },
      ];
      const svg = document.getElementById("plot"),
        ns = "http://www.w3.org/2000/svg";
      function add(tag, attrs, text) {
        const e = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
        if (text !== undefined) e.textContent = text;
        svg.append(e);
      }
      const values = rows.map((r) => r.value),
        min = Math.floor(Math.min(0, ...values) / 10) * 10,
        max = Math.ceil(Math.max(...values) / 10) * 10 || 10;
      const X = (i) => 50 + (i * 390) / Math.max(1, rows.length - 1),
        Y = (v) => 210 - ((v - min) / (max - min)) * 160;
      for (let v = min; v <= max; v += 10) {
        add("line", { x1: 50, x2: 440, y1: Y(v), y2: Y(v), class: "rule" });
        add("text", { x: 42, y: Y(v) + 4, "text-anchor": "end", class: "label" }, String(v));
      }
      const line = rows.map((r, i) => `${i ? "L" : "M"}${X(i)} ${Y(r.value)}`).join(" ");
      add("path", {
        d: line,
        fill: "none",
        stroke: "var(--chart-1)",
        "stroke-width": "var(--stroke-regular)",
        "stroke-linejoin": "round",
      });
      rows.forEach((r, i) => {
        add("circle", { cx: X(i), cy: Y(r.value), r: 3, fill: "var(--chart-1)" });
        add("text", { x: X(i), y: 234, "text-anchor": "middle", class: "label" }, r.date.slice(5));
      });
      document.getElementById("caption").textContent =
        `From ${rows[0].value} to ${rows.at(-1).value} over ${rows.length} months (demonstration values).`;
    </script>
  </body>
</html>
```
