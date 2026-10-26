import { WIDGET_THEME_TOKENS } from "@avenire/ui/tokens";

/** Static renderers and live widgets read the same generated figure palette. */
const rendererTheme = (appearance: "light" | "dark") => {
  const tokens = WIDGET_THEME_TOKENS[appearance];
  return {
    tokens,
    series: [tokens["--figure-hi"], tokens["--figure-mid"], tokens["--figure-lo"]],
    matplotlib: {
      "figure.facecolor": tokens["--figure-page"],
      "axes.facecolor": tokens["--figure-card"],
      "savefig.facecolor": tokens["--figure-page"],
      "savefig.edgecolor": tokens["--figure-page"],
      "text.color": tokens["--figure-strong"],
      "axes.labelcolor": tokens["--figure-text"],
      "axes.edgecolor": tokens["--figure-mid"],
      "xtick.color": tokens["--figure-text"],
      "ytick.color": tokens["--figure-text"],
      "grid.color": tokens["--figure-faint"],
      "axes.linewidth": 0.45,
      "grid.linewidth": 0.45,
      "lines.linewidth": 1.125,
      "font.family": "sans-serif",
      "font.size": 10,
      "axes.titlesize": 11,
      "axes.titleweight": "normal",
      "legend.frameon": false,
      "axes.spines.top": false,
      "axes.spines.right": false,
    },
  };
};

/** The app is dark first, so baked media without a requested appearance uses the dark palette. */
export const DEFAULT_MEDIA_APPEARANCE = "dark" as const;

/** A matplotlibrc so plots are on-palette even when a script never loads the theme file. */
export const matplotlibrc = (appearance: "light" | "dark" = DEFAULT_MEDIA_APPEARANCE) => {
  const theme = rendererTheme(appearance);
  // matplotlibrc treats "#" as a comment, so hex colours are written without it.
  const value = (v: string | number | boolean) =>
    typeof v === "string" ? v.replace(/^#(?=[0-9a-f]{6}$)/i, "") : v === true ? "True" : v === false ? "False" : String(v);
  return [
    ...Object.entries(theme.matplotlib).map(([key, v]) => `${key}: ${value(v)}`),
    `axes.prop_cycle: cycler('color', [${theme.series.map((c) => `'${c.slice(1)}'`).join(", ")}])`,
    "",
  ].join("\n");
};

export const VISUAL_THEME_MANIFEST = {
  version: 1,
  themes: {
    light: rendererTheme("light"),
    dark: rendererTheme("dark"),
  },
} as const;
