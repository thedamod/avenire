import type { PageContextResult } from "./index.ts";

/**
 * Server-side facts about the visual runtime that renders Ruth's inline
 * `<avenire-chart>` / `<avenire-sim>` widgets. `get_page_context` merges these
 * with the page facts the client sends.
 */
export const VISUAL_RUNTIME = {
  version: "0.1.0",
  kits: [
    "kinematics",
    "mechanics",
    "fields",
    "geometry",
    "stochastic",
    "systems",
    "plot",
    "signals",
  ],
  capabilities: ["canvas2d", "webgl", "worker", "pointer", "params", "readouts", "data"],
} as const;

export const VISUAL_BUDGETS = {
  maxSourceBytes: 200_000,
  frameBudgetMs: 8,
} as const;

const VISUAL_TAG = /<avenire-(?:chart|sim)\b([^>]*)>/g;
const attribute = (attributes: string, name: string): string | undefined =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];

/** Visuals with an id in assistant text, so Ruth can revise instead of starting over. */
export const findVisuals = (texts: ReadonlyArray<string>): PageContextResult["existingVisuals"] =>
  texts.flatMap((text) =>
    [...text.matchAll(VISUAL_TAG)].flatMap(([, attributes = ""]) => {
      const id = attribute(attributes, "id");
      return id === undefined ? [] : [{ id, title: attribute(attributes, "title") ?? "" }];
    }),
  );
