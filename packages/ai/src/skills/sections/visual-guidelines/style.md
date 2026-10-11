---
name: style
description: Apply every Avenire theme token and the shared thin-line visual grammar to charts, simulations, and anatomy figures.
---

# Avenire visual style and token system

Use `var(--token)` in HTML/SVG CSS. The host injects all `:root` values at first paint and sends updated values on `avenire:themechange`. Dark overrides colours; it inherits the same font, type, spacing, radius and stroke metrics. For Canvas, read `getComputedStyle(document.documentElement).getPropertyValue('--token')` on startup and each theme event. Avoid hardcoded colours or external fonts. The CSS `@theme inline` names are Tailwind aliases for app UI, not additional widget tokens.

| Token | Purpose and use | Light/dark |
| --- | --- | --- |
| `--background` | Page ground outside a card | Warm paper / deep ink |
| `--foreground` | Main explanatory text | Dark / light ink |
| `--card` | Figure/chart card surface | Near-white / dark panel |
| `--card-foreground` | Text on the card | Dark / light ink |
| `--popover` | Floating tip surface, when needed | Near-white / dark panel |
| `--popover-foreground` | Floating tip text | Dark / light ink |
| `--primary` | Primary action or a single semantic emphasis | Indigo shifts lighter in dark |
| `--primary-foreground` | Text on primary fill | Light / dark contrast |
| `--secondary` | Secondary control surface | Pale / dark surface |
| `--secondary-foreground` | Text on secondary fill | Dark / light contrast |
| `--muted` | Quiet control or key background | Pale / dark surface |
| `--muted-foreground` | Supporting prose, never tiny critical data alone | Medium / lighter ink |
| `--accent` | Selected or hovered surface, sparingly | Pale violet / deep violet |
| `--accent-foreground` | Text on accent surface | Dark / light violet contrast |
| `--destructive` | Error, invalid state or destructive control only | Red tuned per theme |
| `--border` | General UI outlines and dividers | Soft warm / translucent light |
| `--input` | Input outline | Soft warm / translucent light |
| `--ring` | Visible keyboard focus indicator | Indigo in both themes |
| `--canvas` | Drawing ground inside a figure | Paper tint / dark drawing plane |
| `--canvas-grid` | Subtle graph or construction grid | Translucent in both themes |
| `--chart-1` | First data series; preferred focused curve | Indigo, lighter in dark |
| `--chart-2` | Second series | Teal, lighter in dark |
| `--chart-3` | Third series | Warm orange, lighter in dark |
| `--chart-4` | Fourth series | Green, lighter in dark |
| `--chart-5` | Fifth series | Pink, lighter in dark |
| `--chart-6` | Sixth series | Olive, lighter in dark |
| `--font-sans` | UI, labels, captions, axes | System stack; inherited |
| `--font-serif` | Long-form prose or editorial quote only | System serif; inherited |
| `--font-mono` | Numeric readouts, code, technical scales | System mono; inherited |
| `--text-xs` | Tick/quiet label, if still readable at phone width | 0.75rem; inherited |
| `--text-sm` | Secondary label, control and figure caption | 0.875rem; inherited |
| `--text-base` | Body explanation and normal control | 1rem; inherited |
| `--text-lg` | Figure title or key readout | 1.125rem; inherited |
| `--text-xl` | Larger card heading only | 1.25rem; inherited |
| `--text-2xl` | Section heading outside compact widgets | 1.5rem; inherited |
| `--leading-tight` | Titles and compact numbers | 1.25; inherited |
| `--leading-normal` | Prose, controls and captions | 1.5; inherited |
| `--space-1` | Tiny gap between glyph and value | 0.25rem; inherited |
| `--space-2` | Tick/key/internal control gap | 0.5rem; inherited |
| `--space-3` | Closely related control/label pair | 0.75rem; inherited |
| `--space-4` | Default card inset or section gap | 1rem; inherited |
| `--space-5` | Spacious figure inset | 1.25rem; inherited |
| `--space-6` | Figure/title separation | 1.5rem; inherited |
| `--space-8` | Between separate panels | 2rem; inherited |
| `--radius` | Base card/input rounding; reduce for tiny mechanical plates | 0.625rem; inherited |
| `--stroke-hairline` | Construction lines, fine seams, ticks and leaders | 0.6px; inherited |
| `--stroke-thin` | Part edges, axes and small outlines | 1px; inherited |
| `--stroke-regular` | Data paths, main mechanics and measured trajectory | 1.5px; inherited |
| `--stroke-emphasis` | Single focal edge or selected trace; use sparingly | 2px; inherited |
| `--stroke-dash` | Hidden/secondary edges or comparison line; SVG `stroke-dasharray` | `3 3`; inherited |
| `--stroke-dash-open` | Long projection/motion guide; SVG `stroke-dasharray` | `6 4`; inherited |
| `--figure-label` | Quiet labels, ticks and small part names | Tracks muted ink per theme |
| `--figure-leader` | Leader lines and measured guides | Tracks border per theme |
| `--figure-frame` | Outer visual card frame | Tracks border per theme |
| `--figure-label-size` | Small labels in CSS/HTML; increase if cramped | Tracks `--text-xs`; inherited |

## Shared thin-line grammar

All charts, simulations, and anatomy figures use one deliberate finish: hairline construction marks, restrained fills, exact small parts, quiet labels with short leader lines where useful, and a framed `--card` on `--background`. Put title, concise hint and live readout in the card when they clarify interaction. In charts, make axes and grid hairline while data stay regular. In simulations, show the mechanism and one measured quantity with a labelled control. Anatomy figures add a recognisable instrument with a base, support, moving subject, scale and fasteners; every part has a physical job. Use `--chart-1` for the focal mechanism and `--chart-2` onward only for distinct variables. Keep solids mostly neutral; use four value levels through opacity and `--canvas`, `--card`, `--muted`, and `--foreground`, not anatomy's original palette.

Use a fixed `viewBox`, `width:100%`, and `vector-effect:non-scaling-stroke` where scaled SVG strokes would become too heavy. Check labels at 390 px. A subtle grid can orient a plot but should not compete with data. Lines should meet another part, an axis, or the frame; deliberate callouts may end in dots. Depth order matters for isometric parts. Reduce or remove decorative detail when it obscures the relationship.

Do: label units, direct-label a series when space permits, show visible focus, test both themes, keep primary action high contrast, and update Canvas on theme changes. Don't: encode meaning by colour alone, use raw hex values in widgets, use multiple glowing accents, fake 3D for simple stats, use tiny pale text for key numbers, draw arbitrary hatching, or let motion change a displayed value independently of its model.

This grammar is adapted from Anatomy (MIT, wheresryan22); the palette and semantic tokens are Avenire's.
