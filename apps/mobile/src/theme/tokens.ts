/** Shared with global.css. Values are measured from the Mobile Paper page. */
export const colors = {
  bg: "#0B0B0B",
  "surface-1": "#111111",
  "surface-2": "#161616",
  "surface-3": "#1C1C1C",
  "surface-4": "#242424",
  sheet: "#131313",
  fg: "#EDEDED",
  "fg-2": "#A3A3A3",
  "fg-3": "#6E6E6E",
  line: "#222222",
  "line-2": "#2E2E2E",
  accent: "#ABC4FF",
  "accent-text": "#C2D4FF",
  "accent-tint": "#151B2B",
  "accent-line": "#2E3B5E",
  "on-accent": "#0B1020",
  red: "#FF6B6B",
  green: "#6BE0A0",
  amber: "#F2C46D",
} as const;
export const notebookColors = {
  thermo: "#2B9BD8",
  ethics: "#EF4579",
  options: "#18803A",
  ochem: "#D9A50D",
  research: "#B48BF2",
  stat: "#B48BF2",
} as const;
export const motion = {
  duration: { instant: 100, fast: 150, normal: 200, overlay: 250, slow: 400 },
  easing: { out: [0.23, 1, 0.32, 1], drawer: [0.32, 0.72, 0, 1] },
  cssEasing: { out: "cubic-bezier(0.23, 1, 0.32, 1)", drawer: "cubic-bezier(0.32, 0.72, 0, 1)" },
  pressScale: 0.97,
} as const;
export const tokens = {
  colors,
  notebookColors,
  motion,
  radius: { button: 8, input: 8, sheet: 24, composer: 26, tray: 16 },
} as const;
export type ColorToken = keyof typeof colors;
