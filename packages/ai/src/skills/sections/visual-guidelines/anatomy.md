---
name: anatomy
description: Explain a concept as a small working physical object when a mechanism or analogy teaches more than a chart.
---

# Anatomy figure

Use this option when the question is about *how* parts cooperate or a state propagates and a physical mechanism maps cleanly to the idea. A lock can explain cache validity, a gauge can explain feedback, and a ripple tank can explain interference. Use a plain chart for ordinary comparisons and trends, and a simple simulation for direct parameter exploration. Do not turn “v1 versus v2 stats” into a machine.

Write one sentence before drawing: “As **X** changes, **part A** moves, causing **part B** to indicate **Y**.” Check that this is truthful. Build a small pure model returning pose and readout from the same state. Invent a recognizable instrument with base, supports, the thing that moves, a scale, controls and a few true fasteners; do not draw labelled boxes with arbitrary arrows. Every small part needs a mount or joint. Keep one focal colour (`--chart-1`), quiet neutral solids, and fine lines per `style`. A card can show a title, hint, readout and short caption. Consult `anatomy-craft` for geometry, `anatomy-motion` for interaction, and `anatomy-3d` only if actual depth rotation matters.

For SVG isometric work, import `/kits/iso.js`; load `kit-api` for exact signatures. A minimal construction:

```html
<div id="figure" aria-label="Isometric indicator with a raised base"></div>
<script type="module">
import { fitProjection, boxCorners, slabOf, solidSvg, figureSvg, ISO_CSS } from '/kits/iso.js';
const s = document.createElement('style'); s.textContent = ISO_CSS; document.head.append(s);
const base = { x:0, y:0, w:80, d:50, r:5 };
const P = fitProjection(boxCorners(base,0,10),400,250);
document.getElementById('figure').innerHTML = figureSvg({ width:400, height:250, label:'Raised indicator base',
  body:solidSvg(slabOf(base,0,10,P,8,1),{tone:'mid'}) });
</script>
```

The host provides theme variables, but the kit's `ISO_CSS` uses its own `--anatomy-*` vars. Override those variables on `.iso-figure`/`.iso-svg` from Avenire tokens before using kit markup (see the examples); do not ship the source palette. When only a few paths are needed, style the returned SVG markup directly with Avenire variables.

Build the static pose first, then add the control. Reserve height and include a clear fallback state. Check 1× and 4× for floating ends, impossible overlaps and misleading labels. Use `preview_widget` at the actual page width and in both appearances; inspect console and screenshot after input. Explain the analogy and its limits in chat prose. Anatomy source: MIT, wheresryan22.
