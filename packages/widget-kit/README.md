# @avenire/widget-kit

Browser-only ES modules that Ava's HTML widgets import from the widget origin
(`/kits/math.js`, `/kits/iso.js`, `/kits/iso-gl.js`, `/kits/iso.css`). `API.md` is the
model-facing reference; `pnpm --filter @avenire/widget-kit build` writes the kits and a
hashed `manifest.json` to `dist/kits/`.

## Third-party code

- `src/math/` (except `numerics/`): [pmndrs/math](https://github.com/pmndrs/math) by
  Isaac Mason, MIT (`src/math/LICENSE`). `numerics/` and `index.ts` are ours.
- `src/iso/`: the browser runtime of [anatomy](https://github.com/wheresryan22/anatomy)
  by Ryan (wheresryan22), MIT (`src/iso/LICENSE`). Node build/audit scripts and React
  components are not included. `lathe.mjs`, `tube.mjs` and `canvas-painter.mjs` import the
  typed `iso-kit.ts` so the bundle carries accurate signatures. `index.ts` and `gl.ts` are
  our entry points.
