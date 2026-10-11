# Vendored browser math and isometric drawing

- `pmndrs-math/`: source from `context/math/src`, pmndrs/math by Isaac Mason, MIT. The adjacent `LICENSE` applies. Source kept intact; the widget kit provides its own entry point.
- `anatomy/`: browser runtime sources from `context/anatomy/kit`, anatomy by Ryan (wheresryan22), MIT. The adjacent `LICENSE` applies. Node build and audit scripts and React components are excluded. The two dependent runtime modules import the typed `iso-kit.ts` twin so the bundled API has accurate TypeScript signatures.
