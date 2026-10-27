# Avenire marketing design system

The marketing site uses the app's design system, `@avenire/ui`, in its dark theme
(`<html class="dark">`). `src/styles/marketing.css` adds a thin layer for what a landing
page needs and the app doesn't: display type, the dawn colours, one extra text tone and
page widths. Nothing else.

Visual source: the "Landing · Avenire" artboard on the **Landing Page** page of the Paper
file "Avenire". Its values were mapped onto the tokens below; where Paper drifted from
the app by a shade (#F2F2F2 vs #EDEDED, #1A1A1A vs #222222) the app's token wins.

`pnpm --filter @avenire/marketing check:design` enforces the rules at the bottom.

## Character

Dark and quiet, like a monitor left on overnight. The page is set in type: two-tone
headlines (a dim line above, a bright line below) carry the story. The only colour is
**dawn**, the nightly-toast mesh, and it appears only in illustrations, glows and the
text selection. No cards inside cards: sections are separated by hairlines, lists by dividers.

## Primitives (from `@avenire/ui`)

| Primitive                                          | Used for                                                                                                                                     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `buttonVariants`                         | Every call to action. `shape="pill"`; `size="default"` in the nav, `size="xl"` in the email field. Links use `buttonVariants()` on an `<a>`. |
| `InputGroup`, `InputGroupInput`, `InputGroupAddon` | The email field with its button inside (`size="lg" shape="pill"`).                                                                           |
| `Kbd`                                              | The ⌥ Space keycap.                                                                                                                          |
| `Breadcrumb…`                                      | The path bar of the file-explorer block.                                                                                                     |
| `Table…`                                           | The file-explorer block.                                                                                                                     |
| `Separator`                                        | Not used; section rules are borders on the section itself.                                                                                   |

`Breadcrumb`, `Table`, `InputGroup` and the `shape` variant on `Button` were added to
`@avenire/ui` for this page, in the same style as the rest of the package.

## Colour

App tokens (dark theme):

| Token                            | Value             | Use here                                                 |
| -------------------------------- | ----------------- | -------------------------------------------------------- |
| `background`                     | #0B0B0B           | Page                                                     |
| `surface-2`                      | #111111           | Screenshot frames, the file table                        |
| `surface-3`                      | #161616           | Email field, table path bar                              |
| `border`                         | #222222           | Section rules, dividers, table rows                      |
| `input`                          | #2E2E2E           | Frame and field borders                                  |
| `foreground`                     | #EDEDED           | Bright headline line, titles, file names                 |
| `foreground-soft`                | #A3A3A3           | Body, nav links, lead copy                               |
| `muted-foreground`               | #6E6E6E           | Dim headline line, placeholders, table header, copyright |
| `primary` / `primary-foreground` | #EDEDED / #0A0A0A | Button fill / label                                      |

Marketing additions:

| Token               | Value                                 | Use                                              |
| ------------------- | ------------------------------------- | ------------------------------------------------ |
| `foreground-subtle` | #8A8A8A                               | Eyebrows, secondary copy, table cells            |
| `ghost`             | white 7%                              | Footer watermark only                            |
| `dawn-1…4`          | #ABC4FF → #7A6CF0 → #B05BE0 → #FF4F7B | Glows (as images), play-button shadow, selection |

Rules: text never uses `dawn` or `ruth`. A two-tone headline is always
`muted-foreground` then `foreground`.

## Type

Geist for everything, Geist Mono for eyebrows and keycaps. App sizes (`text-xs` 12,
`text-sm` 14) are reused; marketing adds:

| Token      | Size / leading | Tracking | Weight | Use                              |
| ---------- | -------------- | -------- | ------ | -------------------------------- |
| `display`  | 44→72 / 1.06   | -0.04em  | 500    | Hero and final CTA               |
| `headline` | 34→52 / 1.08   | -0.035em | 500    | Numbered section headings, Trust |
| `subhead`  | 28→44 / 1.18   | -0.03em  | 500    | Statement and Files headings     |
| `lead`     | 19 / 29        |          | 400    | Hero subline                     |
| `body-lg`  | 17 / 26        |          | 400    | Section intros                   |
| `label`    | 16 / 20        |          | 500    | Feature titles                   |
| `body`     | 15 / 23        |          | 400    | Feature copy                     |
| `logo`     | 18 / 22        | -0.02em  | 600    | Name next to the mark            |
| `wordmark` | 120→384 / 1    | -0.08em  | 600    | Footer watermark                 |

Eyebrow: `font-mono text-xs uppercase tracking-eyebrow text-foreground-subtle`.
Type tokens carry their own weight and tracking; don't override them.

## Space and layout

- The app's 4px spacing scale (`gap-5` = 20px).
- Page column: `mx-auto max-w-page px-6 md:px-10` → a 1216px column at 1440.
- Section: `border-t border-border pt-24 pb-30` (96 / 120). Header to media: `gap-14` (56).
- Eyebrow to heading: `gap-5`. Feature rows: `py-6`, `gap-2` inside.
- Widths: `field` 440, `lead` 600, `aside` 360, `heading` 780, `statement` 1040, `window` 1120.
- Breakpoints: the app's `md` (768) and `lg` (1024). Below `lg`, two-column rows stack.

## Shape and depth

- App radii only: `rounded-sm` (4px) on screenshot frames, `rounded-full` on pills and
  the play button. Primitives bring their own radius.
- Frame: `overflow-clip rounded-sm border border-input bg-surface-2`.
- Shadows: `shadow-window` (hero window ring) and `shadow-play` (play button). No others.

## Motion

Emil Kowalski's rules on the app's tokens (`--ease-out`, `--duration-*`), plus two
marketing tokens in `marketing.css`: `--duration-reveal` (700ms) and `--reveal-distance` (24px).

- **Float in.** Put `data-reveal` on an element and it floats in (opacity + `translate`)
  once, the first time it enters the viewport. Elements arriving together stagger by
  70ms. The hero uses the same mechanism, so it floats in on load. Never nest
  `data-reveal` (`Eyebrow` takes `reveal={false}` inside an element that already floats).
  The script is inline in `Base.astro`; without it (`html:not(.js)`) nothing is hidden.
- **Hero art.** `HeroArt` (`client:load`) draws the exhaust as liquid in WebGL2
  (`src/shaders/hero-flow.frag`, a port of `design/landing-v4/tools/hero_flow.py`). It pours out of the
  nozzle on load, its bands keep flowing outward, and the pointer drags and parts it. The rocket
  flies in along its heading, then hovers and leans toward the pointer on a spring; the
  stream's source follows the nozzle. The art lives in the `hero-frame` utility (a 1440px
  frame centred on wide screens, pinned right below 1440); the stream's far end always
  rides the viewport's left edge. It renders at half resolution and pauses offscreen and in
  background tabs.
- **Fallbacks.** No WebGL2, a lost context, or a GPU that can't draw a frame within 16ms
  (timed once at startup) gets the static `hero-flow.webp` and a resting rocket. Below `lg`
  the hero has no art.
- **Reduced motion.** Gentler, not zero: reveals keep the fade and drop the travel; the
  hero renders one still frame of the full stream with the rocket at rest and ignores the pointer.
- **Hover.** Colour transitions only. The video poster fades out over `duration-moderate`
  when playback starts.

The plume's palette lives in the shader. It is illustration, built from the dawn tokens,
not UI colour.

## Components

React, in `src/components`, rendered to static HTML by Astro. Two islands hydrate:
`HeroArt` (`client:load`) and `VideoFrame` (`client:visible`). Copy and links live in
`src/content.ts`.

## Rules the checker enforces (in `src/`)

1. No arbitrary values in class names (`w-[…]`, `text-[#…]`, `p-[13px]`).
2. No hex, `rgb()` or `px` values outside `src/styles/marketing.css`.
3. No `style=` props.
