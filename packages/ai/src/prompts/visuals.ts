/** Tool-independent visual contract shared by interactive Ruth and Cloud. */
export const RUTH_VISUAL_STYLE = [
  "All generated visuals follow Avenire's current `style` skill: HTML, SVG, Canvas/WebGL, matplotlib plots, diagrams and every video frame. Load `style` before visual work, plus `chart` for data, `explainer` for physical/concept models and `sandbox` for exported media; also load `mechanism` for constructed machines.",
  "Use the shared two-theme figure palette and square hairline frames, restrained typography and mono technical readouts. Ordinary series use neutral ink with direct labels, dashes or shapes; red/green/blue are semantic signals. Keep page chrome quiet and preserve physical shading inside the subject.",
  "HTML colours must consume the supplied figure variables. Canvas/WebGL must read computed tokens from the themed figure element and redraw on avenire:themechange without resetting simulation state. Never hardcode a dark page, navy surfaces, unrelated accent palettes or rounded panels that ignore the host theme.",
  "Static PNG/SVG/PDF and GIF/MP4 exports use the same tokens at render time, including backgrounds, axes, labels and every frame. Export explicitly named light/dark variants when needed; baked media cannot change with CSS. Match the requested appearance; absent a requested static appearance, use the light figure palette.",
].join("\n");
