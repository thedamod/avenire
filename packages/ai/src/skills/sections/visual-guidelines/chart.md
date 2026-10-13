---
name: chart
description: Draw correct, restrained hand-written SVG charts for comparisons, trends, distributions, and relationships.
---

# Chart

Use a plain chart for data questions, comparisons, and trends. For how/why concept explanations, use `explainer` to choose a direct model, mechanism or analogy. Use hand-written SVG and embedded computed JSON, with no chart library. Call `get_page_context`, load `style`, preview with `preview_widget`, then `render_widget`. Start from a question, identify the relevant fields and units, and do not invent observations.

| Question | Marks and scale |
| --- | --- |
| One value per category | Bar from zero; sort only if order is not meaningful |
| v1 versus v2 or several cohorts | Grouped bars with shared zero baseline; annotate delta in units and percent (if baseline nonzero) |
| Values over time | Line with true ordered dates and gaps for missing values; use area only when zero baseline and magnitude matter |
| Relation between two measures | Scatter; optional fit line using `linearRegression` from `kit-api`; say what was fitted, never imply causation |
| Frequency distribution | Histogram of equal-width bins; show count or density and bin width |
| Several comparable subgroups | Small multiples with the **same scale** and axes, unless clearly labelled otherwise |

For a numeric axis, compute a “nice” step from `10^floor(log10(range/targetTicks)) × {1,2,5,10}`. Round domain outward; include zero for bars and area. Map y with `bottom - (value - min)/(max - min) * plotHeight`; guard equal min/max. Render 3–6 ticks with units and localized formatting (`Intl.NumberFormat`). Keep date spacing proportional to time unless the data are categories. Never silently connect across nulls or truncate an axis to dramatize a change. Use sufficient margins for tick labels, then measure the narrow preview.

Use neutral ink `--figure-hi`, `--figure-mid`, `--figure-lo` for ordinary series; reserve `--figure-red/green/blue` for real signals. Widget aliases `--chart-1..6` follow those tones. Use `--stroke-regular` for data lines, `--stroke-hairline` and `--figure-leader` for axes and rules, `--figure-label` and `--figure-label-size` for ticks, and `--figure-frame` for the card. No gradient is needed for ordinary charts. Label each line directly at its end when possible; use a legend for crowded lines or grouped bars. Pair colour with text, point shape, or dash. Annotate the one comparison or inflection that answers the question; keep annotation lines thin. Include a short caption or accessible table with precise values. Explain the takeaway in chat prose, with denominator and uncertainty if relevant.

## Data workflow

Use the user's supplied numbers, search/read tools for cited sources, or the sandbox for CSV/XLSX. In the sandbox, inspect columns and missing values with pandas, parse dates and numeric fields explicitly, compute aggregates there, and print compact JSON. Embed that JSON literal in the HTML; never use `fetch` in the widget. See `chart-from-spreadsheet` for a complete example. If there are many thousands of marks, if the user needs a static export, or if frame-by-frame animation is the point, draw with matplotlib and `publish_asset` instead; keep the same colours and thin-line rules. Use SVG for normal interactive, small to medium data.

```js
const rows = [{ label: 'v1', value: 24 }, { label: 'v2', value: 31 }];
const max = Math.max(0, ...rows.map(r => r.value));
const y = v => 170 - 130 * v / (max || 1);
const bars = rows.map((r, i) => `<rect x="${60 + i * 110}" y="${y(r.value)}" width="54" height="${170-y(r.value)}" fill="var(--chart-${i+1})"/>`).join('');
document.querySelector('svg').insertAdjacentHTML('beforeend', bars);
```

For untrusted labels, build text nodes with DOM APIs or escape HTML before `innerHTML`.

## Mark recipes

After computing `x(value)` and `y(value)` from a shared plot box, use these compact SVG patterns. Keep marks in data order; create text through `textContent` if labels come from outside data. `H` is the zero baseline and `W` is a category band's width.

```js
const bar = (x0, v, W, H, y) => `<rect x="${x0}" y="${y(v)}" width="${W}" height="${H-y(v)}" fill="var(--chart-1)"/>`;
const grouped = (x0, values, W, H, y) => values.map((v,i) =>
  `<rect x="${x0+i*W/values.length}" y="${y(v)}" width="${W/values.length-2}" height="${H-y(v)}" fill="var(--chart-${i+1})"/>`).join('');
const line = (points, x, y) => `<path d="${points.map((p,i) => `${i?'L':'M'}${x(p)} ${y(p)}`).join(' ')}" fill="none" stroke="var(--chart-1)" stroke-width="var(--stroke-regular)"/>`;
const area = (points, x, y, H) => `<path d="${linePath(points,x,y)} L${x(points.at(-1))} ${H} L${x(points[0])} ${H}Z" fill="var(--chart-1)" opacity=".16"/>`;
const linePath = (points,x,y) => points.map((p,i) => `${i?'L':'M'}${x(p)} ${y(p)}`).join(' ');
```

For scatter, draw one `<circle>` per valid `(x,y)` observation and use `linearRegression(xs,ys)` for an optional fit line from `fit.intercept + fit.slope*x`; show `fit.r2` and label the line “least squares fit.” For a histogram, use `histogram(values,bins,min,max)` from `/kits/math.js`, then draw `counts[i]` as touching bars between `edges[i]` and `edges[i+1]` (or divide by `count * binWidth` for density). For small multiples, call the same chart rendering function on each subgroup with one shared numeric domain and the same tick step; title each panel. These recipes use no data smoothing. A line chart with gaps should split into separate paths, not join across missing rows.

## Figure frame

Frame every page with Fig n at top left and a short mono uppercase title at top right; hint bottom left and mono tabular live readout bottom right. Put the legend and a true caption under the card, not inside the drawing. Use square corners, --figure-card on --figure-page, a hairline --figure-mid frame, 0.6px construction strokes, and calm --figure-ease motion. Charts keep units/tick labels in their plot; simulations use one model for readout and motion. Use kit plateHtml if working in Node. Keep it responsive at 390px, fix preview errors before delivery, and deliver built files by path.
