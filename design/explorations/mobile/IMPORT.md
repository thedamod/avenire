# Avenire · Mobile → Paper

Staged on 2026-10-15 because Paper's weekly MCP limit hit before anything was written
(resets ~2026-10-17). Everything here is generated; edit `lib.mjs` / `screens-*.mjs`, then
`node build.mjs`.

- `screens/<id>.html`: one Paper-ready fragment per artboard (inline styles, flex only,
  no margins, one style per text node).
- `manifest.json`: artboard name, size, canvas position (`left`/`top`), background.
- `index.html`: the whole page laid out like the canvas. `view.html?ids=M01,M02`: a few
  screens side by side (serve the folder: `python3 -m http.server 8765`).

## Import (about 2 Paper calls per screen)

1. `create_page({ fileId: "01M4Z8NJ7VEA2BECXE5G9Q4G2V", name: "Mobile" })`
2. For each manifest entry, in order:
   `create_artboard({ pageId, name, styles })`, then
   `write_html({ targetNodeId: <artboard>, mode: "insert-children", html: <screens/ID.html> })`.
3. Screenshot a few artboards (M01, M12, M26, M30), then `finish_working_on_nodes`.

Two fragments clone desktop nodes with `<x-paper-clone>` (they only work inside this file):
M16 clones the Raptor 2 figure (`1XZ-0`) and M32 writes the Avenire wordmark (the desktop "hello" script was replaced, it is Apple lettering).
The onboarding mesh backgrounds are the file's existing assets (public URLs).
