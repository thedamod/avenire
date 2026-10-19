---
name: chart
description: Render a chart as a standalone HTML document through render_widget. Use for values, categories, trends and distributions.
---

# Chart

Call `get_page_context` first, then `render_widget({ title, html })` with a complete
HTML document. Draw with inline SVG or Canvas and inline JavaScript; no external
libraries or network requests. Embed rows directly from the user's material or
sandbox results. Never invent values.

Pick the simplest mark: bars for comparison, lines for trends, points for relationships,
histograms or box plots for distributions. At most five series. Label axes with units;
provide a legend and accessible text or a data table. Pair colour with labels or patterns.
Use the theme's `--chart-1` through `--chart-6`, `--foreground`, `--muted-foreground`,
`--border`, font, spacing and type variables. For Canvas, listen for
`avenire:themechange` and re-read computed variables before redrawing.

Add tooltips or filters only when they support the question. Keep layout responsive
to the measured width. Put the takeaway in chat prose after the widget.
Inline `<avenire-chart>` tags are coming later; do not write them now.
