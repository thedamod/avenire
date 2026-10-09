import type { PageContextResult } from "./index.ts";

/** Stored HTML widgets run in an isolated iframe; chart/simulation kits are coming later. */
export const VISUAL_RUNTIME = {
  version: "0.1.0",
  kits: [],
  capabilities: ["html", "svg", "canvas2d", "pointer", "params", "readouts"],
} as const;

export const VISUAL_BUDGETS = {
  maxSourceBytes: 512 * 1024,
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
