import { createHash } from "node:crypto";

/**
 * Folds compatibility forms, dashes, quotes, case and whitespace, so "Eigen‑Value"
 * and "eigen-value" compare equal. Applied to stored chunks and to queries alike.
 */
export const normalizeForMatch = (text: string): string =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export const sha256Hex = (text: string): string => createHash("sha256").update(text).digest("hex");

/** `[1,2]` as a pgvector literal. */
export const toVectorLiteral = (vector: ReadonlyArray<number>): string => `[${vector.join(",")}]`;
