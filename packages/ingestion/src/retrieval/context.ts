/** Before/after snippets for hits that were cut mid-sentence. Pure. */

/** About 60 tokens of neighbouring text on each side. */
const SNIPPET_CHARS = 240;
/** Chunk windows overlap by at most this much (48 tokens, plus slack). */
const MAX_OVERLAP_CHARS = 400;

export const startsMidSentence = (text: string): boolean => /^\s*[\p{Ll}\d,;)]/u.test(text);
export const endsMidSentence = (text: string): boolean => !/[.!?:)"'\]]\s*$/u.test(text);

/** Length of the longest suffix of `left` that is a prefix of `right`. */
const overlap = (left: string, right: string): number => {
  for (let length = Math.min(left.length, right.length, MAX_OVERLAP_CHARS); length > 0; length--) {
    if (left.endsWith(right.slice(0, length))) return length;
  }
  return 0;
};

/** The end of `previous` that leads into `content`, without the overlapping words. */
export const beforeSnippet = (previous: string, content: string): string => {
  const unique = previous.slice(0, previous.length - overlap(previous, content));
  const tail = unique.slice(-SNIPPET_CHARS);
  return (tail.length < unique.length ? tail.replace(/^\S*\s+/u, "") : tail).trim();
};

/** The start of `next` that follows `content`, without the overlapping words. */
export const afterSnippet = (content: string, next: string): string => {
  const unique = next.slice(overlap(content, next));
  const head = unique.slice(0, SNIPPET_CHARS);
  return (head.length < unique.length ? head.replace(/\s+\S*$/u, "") : head).trim();
};
