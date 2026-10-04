---
name: chart
description: Write an <avenire-chart> - a declarative, Vega-Lite-shaped chart spec rendered natively with tooltips, legend toggles, brushing and filters. Use for large amounts of raw information.
---

# Chart

A chart is a JSON spec inside `<avenire-chart>`. The renderer adds the interactions
itself (crosshair tooltip, legend toggle, brush-to-zoom, filter chips, data table, copy
data), so the spec only describes the data and the encoding. No code.

```html
<avenire-chart id="vis-co2" title="CO₂ and temperature, 1900–2020">
  { "mark": "line", "data": { "values": [{ "year": 1900, "co2": 296, "temp": -0.08 }] }, "encoding":
  { "x": { "field": "year", "type": "temporal" }, "y": { "field": "co2", "type": "quantitative",
  "title": "CO₂ (ppm)" } }, "interactions": { "brush": "x" } }
</avenire-chart>
```

## Spec

- `mark`: `bar` | `line` | `area` | `point` | `rule` | `arc` | `boxplot` | `heatmap` |
  `histogram` | `candlestick`.
- `encoding`: `x`, `y`, `color`, `size`, `facet`, each `{ field, type, aggregate?, title? }`
  where `type` is `quantitative` | `temporal` | `ordinal` | `nominal`.
- `transform` (optional): `filter`, `aggregate`, `bin`, `window`.
- `data`: `{ "values": [...] }` inline rows, or `{ "dataRef": "<run_python data name>" }`.
- `layer` (optional): an array of `{ mark, encoding }` for overlays, e.g. a second axis.
- `interactions` (optional hints): `{ "brush": "x" | "xy", "filter": "<field>" }`.

## Rules

- Values must come from the user's material or a `run_python` result. Never invent data.
- Pick the simplest mark that shows the shape: bar for comparison, line for trend,
  point for relationship, histogram/boxplot for distribution.
- At most 5 series, and only use colour when it encodes something.
- Title axes with units. Put the takeaway in your prose, not in the chart.
