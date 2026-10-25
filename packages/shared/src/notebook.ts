import { FolderColor, FolderCover } from "@avenire/contracts";

/** Stable appearance for every notebook creation path, including automatic filing. */
export const defaultNotebookAppearance = (name: string) => {
  let hash = 2166136261;
  for (const character of name.trim())
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
  return {
    color: FolderColor.literals[hash % FolderColor.literals.length]!,
    cover: FolderCover.literals[(hash >>> 8) % (FolderCover.literals.length - 1)]!,
  };
};

const LATEX_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  Delta: "Δ",
  epsilon: "ε",
  eta: "η",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  Sigma: "Σ",
  tau: "τ",
  phi: "φ",
  omega: "ω",
  Omega: "Ω",
  ge: "≥",
  geq: "≥",
  le: "≤",
  leq: "≤",
  neq: "≠",
  approx: "≈",
  to: "→",
  rightarrow: "→",
  times: "×",
  cdot: "·",
  infty: "∞",
  sum: "∑",
  int: "∫",
  oint: "∮",
  partial: "∂",
  nabla: "∇",
  pm: "±",
  sqrt: "√",
};

/** Inline TeX as readable text: `$\Delta S \ge 0$` → `ΔS ≥ 0`. */
const plainMath = (tex: string) =>
  tex
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    .replace(/\\([A-Za-z]+)/g, (whole, name: string) => LATEX_SYMBOLS[name] ?? name)
    .replace(/[{}]/g, "")
    .replace(/\s*([_^])\s*/g, "")
    .replace(/(Δ|δ|∂|∇)\s+/g, "$1");

/** Compact plain-text opening for note lists; no storage read is required. */
export const markdownPreview = (markdown: string) =>
  markdown
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/\$\$([^$]*)\$\$/g, (_, tex: string) => plainMath(tex))
    .replace(/\$([^$\n]+)\$/g, (_, tex: string) => plainMath(tex))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, "")
    // Markdown escapes (`\*`, `\_`) and the emphasis markers themselves.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>$])/g, "$1")
    .replace(/[#*_~`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
