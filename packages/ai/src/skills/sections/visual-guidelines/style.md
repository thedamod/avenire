---
name: style
description: Shared figure tokens and figure framing for all Ruth widgets, charts and simulations; app UI palette stays separate.
---

# Figure style

Every widget uses the shared two-theme token layer. The host injects it before first paint and on `avenire:themechange`; it updates `.iso` wrappers’ data-theme and values. Standalone kit `--light` pages retain their own theme outside the host. Read Canvas/WebGL tokens on its nearest `.iso` wrapper (and redraw/reconfigure on themechange). Use CSS variables for every colour and preserve the kit’s four facing shades; do not replace them with opacity approximations.

The same figure contract applies to exported matplotlib charts, SVG/PDF diagrams, GIFs and MP4s. Use the selected theme for backgrounds, labels, axes, marks and every video frame; never invent a separate media palette. Cloud's `get_page_context` supplies `themeFile`, a server-written JSON manifest containing both production token sets, neutral series and matplotlib rcParams. Read it in render scripts. Static exports use the requested appearance, or light when none is requested; provide separately named variants when both themes are needed. Static media cannot respond to live CSS. See `sandbox` for renderer recipes.

The restraint applies to chrome, palette and line weight; it does not flatten the object. Mechanical figures retain solid thickness, facing shades, smooth curved shading and grounded contact shadows. Localized physical light, flame or exhaust may use the source kit's shader/material treatment inside the object; keep it in perspective and the surrounding UI stable. Avoid decorative page gradients and ambient UI glow, while preserving the physical shading that makes an assembly readable. See `mechanism` for construction and close-up fidelity.

| Token | Purpose | Light | Dark |
| --- | --- | --- | --- |
| `--figure-page` | Page ground | `#f2f2ef` | `#0b0b0b` |
| `--figure-card` | Framed card surface | `#fbfbfa` | `#131313` |
| `--figure-text` | Caption and live readout ink | `#57575a` | `#a3a3a3` |
| `--figure-strong` | Strong explanatory ink | `#18181a` | `#e6e6e6` |
| `--figure-muted` | Hints, quiet labels, legend | `#8c8c90` | `#6e6e6e` |
| `--figure-paper` | Opaque backing fill hiding parts behind | `#fbfbfa` | `#131313` |
| `--figure-face` | Lit subject backing | `#ffffff` | `#1b1b1b` |
| `--figure-top` | Normal upper faces | `#ffffff` | `#1c1c1c` |
| `--figure-shade-0` | Side facing away from light | `#dcdcd9` | `#0f0f0f` |
| `--figure-shade-1` | Second side tone | `#e5e5e2` | `#121212` |
| `--figure-shade-2` | Third side tone | `#ededea` | `#151515` |
| `--figure-shade-3` | Side facing toward light | `#f4f4f1` | `#181818` |
| `--figure-lit-top` | Selected upper face | `#ffffff` | `#262626` |
| `--figure-lit-shade` | Selected side faces | `#eeeeeb` | `#1d1d1d` |
| `--figure-hi` | Subject outlines | `#26262a` | `#d4d4d4` |
| `--figure-mid` | Structural outlines and card frame | `#8a8a8f` | `#6a6a6a` |
| `--figure-lo` | Base outlines and minor ticks | `#b4b4b8` | `#3e3e3e` |
| `--figure-faint` | Grooves, creases and quiet detail | `#d4d4d6` | `#2a2a2a` |
| `--figure-lit` | Exactly one active accent | `#000000` | `#ffffff` |
| `--figure-halo` | Contact shadow colour | `#8a8a80` | `#050505` |
| `--figure-halo-opacity` | Contact shadow alpha | `.32` | `.9` |
| `--figure-dot` | Screws and rivets | `#3a3a3e` | `#e6e6e6` |
| `--figure-red` | Red signal, when semantic | `#e5484d` | `#ff6b6b` |
| `--figure-green` | Green signal, when semantic | `#30a46c` | `#6be0a0` |
| `--figure-blue` | Blue signal, when semantic | `#3e63dd` | `#6b9bff` |
| `--figure-weight` | Non-scaling 0.6px hairlines | `.6px` | `.6px` |
| `--figure-ease` | Calm motion easing | `cubic-bezier(.32,.72,0,1)` | `cubic-bezier(.32,.72,0,1)` |
| `--figure-mono` | Technical labels and tabular readout font | `ui-monospace,"SF Mono",Menlo,Consolas,monospace` | `ui-monospace,"SF Mono",Menlo,Consolas,monospace` |
| `--figure-lift` | Subtle inset/drop shadow | `inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a` | `inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014` |

The mono stack, weight and easing are identical in both themes. The lift shadow stays subtle; the card itself has a square hairline frame. Base/feet are lo, structure mid, subject hi, and exactly one lit accent (black in light, white in dark). True red/green/blue are for signals, never a rainbow series palette.

## Frame and controls

Use `plateHtml` from the sandbox kit, or reproduce its exact framing: Fig n top left; short mono uppercase title top right; interaction hint bottom left; mono tabular live readout bottom right. Legend keys and a concise true caption sit underneath the card. Keep legend plus caption under about 50 words; put the explanation/derivation in chat. At most one tiny engraved label is inside the machine. Native Step / Run / Reset buttons and parameter sliders have labels and visible focus. Use the same model for readout, part motion and caption. Ensure readout/hint wrap or stack at 390px without colliding. Reduced motion shows a meaningful still state with explicit stepping; stop loops while hidden/offscreen.

## Widget compatibility aliases

Widget semantic tokens map onto the figure layer: background→page; foreground→text; card/popover→card with strong ink; primary→lit on card ink; secondary→shade-2; muted→shade-3 with muted ink; accent→lit-shade with lit ink; destructive→red; border→mid; input→lo; ring→hi; canvas→paper; canvas-grid→faint; radius→0px. App shadcn tokens remain unchanged. `--chart-1..6` map to hi, mid, lo, red, green, blue respectively. Label or dash every series; use signals only when their meaning earns colour.

The shared typography/layout metrics remain: font-sans system UI, font-serif system serif, font-mono figure-mono; text-xs/sm/base/lg/xl/2xl = 0.75/0.875/1/1.125/1.25/1.5rem; leading-tight/normal = 1.25/1.5; space-1/2/3/4/5/6/8 = 0.25/0.5/0.75/1/1.25/1.5/2rem. Stroke-hairline = figure-weight, thin/regular/emphasis = 1/1.5/2px; dash = 3 3, dash-open = 6 4; figure-label = muted, figure-leader = lo, figure-frame = mid, figure-label-size = text-xs. These aliases exist for charts; interactive figures use the tokens directly.

Use fixed SVG viewBox, width:100%, vector-effect:non-scaling-stroke, opaque filled solids and correct painter order. Ground line ends on a stroke, dot or outline. Ordinary chat starts with one CSP-wrapped preview. Repair errors and preview again before delivery; continue as long as the task needs. Full capture/drive/lines/audit and repeated theme/phone checks are for explicitly requested deep verification. Reuse components and example patterns with any concise browser code; deliver large built pages with path.
