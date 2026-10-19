import type { PageContextResult } from "./index.ts";

/** Shipped browser kits; Node builds use the full read-only sandbox toolchain. */
export const VISUAL_RUNTIME = {
  version: "0.1.0",
  sourceRoot: "/opt/avenire/figures",
  kits: ["/kits/math.js", "/kits/iso.js", "/kits/iso-gl.js", "/kits/iso.css"],
  capabilities: ["html", "svg", "canvas2d", "webgl", "pointer", "params", "readouts"],
} as const;

export const VISUAL_BUDGETS = {
  maxSourceBytes: 8 * 1024 * 1024,
  maxInlineSourceBytes: 512_000,
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
