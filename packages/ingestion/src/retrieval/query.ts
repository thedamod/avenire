import type { SearchQuery } from "@avenire/contracts";

import { normalizeForMatch, sha256Hex } from "../text.ts";

export interface QueryAnalysis {
  readonly text: string;
  readonly normalized: string;
  readonly phrases: ReadonlyArray<string>;
  readonly identifiers: ReadonlyArray<string>;
  readonly location: {
    readonly pages: ReadonlyArray<number>;
    readonly seconds: ReadonlyArray<number>;
  };
  readonly lexical: {
    readonly terms: ReadonlyArray<string>;
    readonly negated: ReadonlyArray<string>;
  };
}

const unique = <T>(values: ReadonlyArray<T>): ReadonlyArray<T> => [...new Set(values)];
const words = (text: string): ReadonlyArray<string> =>
  text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export const analyzeQuery = (input: string): QueryAnalysis => {
  const pages: number[] = [];
  const seconds: number[] = [];
  let text = input.replace(
    /\b(?:pp?\.?|pages?)\s*(\d+)(?:\s*[-–]\s*(\d+))?\b/giu,
    (match, first: string, last?: string) => {
      const start = Number(first);
      const end = last === undefined ? start : Number(last);
      if (end < start || end - start > 50) return match;
      for (let page = start; page <= end; page++) pages.push(page);
      return " ";
    },
  );
  text = text.replace(
    /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b(?!\s*(?:am|pm)\b)/giu,
    (match, first: string, second: string, third?: string) => {
      const middle = Number(second);
      const tail = third === undefined ? undefined : Number(third);
      if (middle > 59 || (tail !== undefined && tail > 59)) return match;
      seconds.push(
        tail === undefined
          ? Number(first) * 60 + middle
          : Number(first) * 3600 + middle * 60 + tail,
      );
      return " ";
    },
  );
  text = text.replace(/\s+/gu, " ").trim() || input.trim();

  const phrases: string[] = [];
  const withoutPhrases = text.replace(
    /"([^"\n]+)"|`([^`\n]+)`/gu,
    (_match, double?: string, backtick?: string) => {
      const phrase = (double ?? backtick ?? "").trim();
      if (phrase) phrases.push(phrase);
      return " ";
    },
  );
  const identifiers: string[] = [];
  const identifierPattern =
    /\b[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)+\(\)|\b[\p{L}_][\p{L}\p{N}_]*\(\)|\b[\p{L}][\p{L}\p{N}]*_[\p{L}\p{N}_]+\b|\b[\p{Ll}]+[\p{Lu}][\p{L}\p{N}]*\b|\b[\p{L}][\p{L}\p{N}]*\.[\p{L}_][\p{L}\p{N}_]*\b|\b[\p{L}\p{N}]+\s*(?:=|\^)\s*[\p{L}\p{N}_+*/().^-]+/gu;
  const withoutIdentifiers = withoutPhrases.replace(identifierPattern, (identifier) => {
    identifiers.push(identifier.trim());
    return " ";
  });
  const terms: string[] = [];
  const negated: string[] = [];
  for (const token of withoutIdentifiers.match(/-?[\p{L}\p{N}]+/gu) ?? []) {
    const target = token.startsWith("-") ? negated : terms;
    target.push(...words(token.startsWith("-") ? token.slice(1) : token));
  }
  return {
    text,
    normalized: normalizeForMatch(text),
    phrases: unique(phrases),
    identifiers: unique(identifiers),
    location: { pages: unique(pages), seconds: unique(seconds) },
    lexical: { terms: unique(terms), negated: unique(negated) },
  };
};

/** Hits returned when the query doesn't ask for a number, and the most it may ask for. */
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;

export const resultLimit = (query: SearchQuery): number =>
  Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));

export const optionsKey = (query: SearchQuery, analysis: QueryAnalysis): string =>
  sha256Hex(
    JSON.stringify({
      kinds: [...(query.kinds ?? [])].sort(),
      clusterIds: [...(query.clusterIds ?? [])].sort(),
      limit: resultLimit(query),
      depth: query.depth ?? "standard",
      pages: [...analysis.location.pages].sort((a, b) => a - b),
      seconds: [...analysis.location.seconds].sort((a, b) => a - b),
      phrases: [...analysis.phrases].sort(),
      identifiers: [...analysis.identifiers].sort(),
      negated: [...analysis.lexical.negated].sort(),
    }),
  );
