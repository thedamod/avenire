---
name: chart-comparison
description: Show v1 versus v2 metrics as plain grouped SVG bars with labelled deltas and a shared zero scale.
---

# Comparison chart example

Use actual source values in place of these labelled demonstration values. The default is a direct chart, with a thin-line card and one useful annotation. Preview at 390 px and both themes before rendering.

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
        background: var(--card);
        border: var(--stroke-hairline) solid var(--figure-frame);
        border-radius: var(--radius);
      }
      h2 {
        margin: 0;
        font-size: var(--text-lg);
      }
      p {
        margin: var(--space-2) 0 0;
        color: var(--muted-foreground);
        font-size: var(--text-sm);
      }
      figcaption {
        font-size: var(--text-sm);
        color: var(--muted-foreground);
      }
      svg {
        display: block;
        width: 100%;
        height: auto;
        margin-top: var(--space-3);
      }
      .axis {
        stroke: var(--figure-leader);
        stroke-width: var(--stroke-hairline);
      }
      .tick {
        fill: var(--figure-label);
        font-size: calc(var(--figure-label-size) * 1.3);
        font-family: var(--font-sans);
      }
      .value {
        fill: var(--foreground);
        font-size: calc(var(--figure-label-size) * 1.3);
        font-family: var(--font-mono);
      }
    </style>
  </head>
  <body>
    <figure>
      <h2>v1 and v2 · example metrics</h2>
      <p>Demonstration values, units in percent. Replace with measured data.</p>
      <svg
        id="plot"
        viewBox="0 0 480 285"
        role="img"
        aria-label="Grouped bars comparing v1 and v2 on recall and accuracy"
      ></svg>
      <figcaption id="caption"></figcaption>
    </figure>
    <script type="module">
      const data = [
        { label: "Recall", unit: "%", v1: 64, v2: 76 },
        { label: "Accuracy", unit: "%", v1: 71, v2: 74 },
      ];
      const svg = document.getElementById("plot"),
        ns = "http://www.w3.org/2000/svg";
      function add(tag, attrs, text) {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
        if (text !== undefined) el.textContent = text;
        svg.append(el);
        return el;
      }
      const top = 28,
        bottom = 225,
        left = 54,
        right = 448,
        y = (v) => bottom - (v / 100) * (bottom - top);
      for (let t = 0; t <= 100; t += 25) {
        add("line", { x1: left, x2: right, y1: y(t), y2: y(t), class: "axis" });
        add("text", { x: left - 10, y: y(t) + 4, "text-anchor": "end", class: "tick" }, `${t}%`);
      }
      data.forEach((d, i) => {
        const cx = 158 + i * 184;
        for (const [j, key] of ["v1", "v2"].entries()) {
          const x = cx - 42 + j * 43,
            v = d[key];
          add("rect", {
            x,
            y: y(v),
            width: 34,
            height: bottom - y(v),
            fill: `var(--chart-${j + 1})`,
          });
          add("text", { x: x + 17, y: y(v) - 6, "text-anchor": "middle", class: "value" }, `${v}%`);
        }
        add("text", { x: cx - 4, y: bottom + 22, "text-anchor": "middle", class: "tick" }, d.label);
        add(
          "text",
          { x: cx - 4, y: bottom + 41, "text-anchor": "middle", class: "value" },
          `+${d.v2 - d.v1} pp`,
        );
      });
      add("text", { x: 175, y: 18, class: "tick" }, "v1");
      add("rect", { x: 157, y: 8, width: 11, height: 11, fill: "var(--chart-1)" });
      add("text", { x: 236, y: 18, class: "tick" }, "v2");
      add("rect", { x: 218, y: 8, width: 11, height: 11, fill: "var(--chart-2)" });
      document.getElementById("caption").textContent =
        "Recall improves by 12 percentage points; accuracy by 3 percentage points.";
    </script>
  </body>
</html>
```
