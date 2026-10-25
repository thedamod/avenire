/** Markdown → plain prose for the streaming sentence view. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.|>)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The sentence being written and the one before it. While streaming, the last fragment is the
 * current sentence; when a sentence has just ended it stays current until the next one starts.
 */
export function streamingSentences(text: string): { previous: string | null; current: string } {
  // A sentence ends at . ! ? followed by whitespace, so "1.9 s" or "e.g." mid-word stays whole.
  const parts = text
    .split(/(?<=[.!?]["”’)]?)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return { previous: null, current: "" };
  return { previous: parts.length > 1 ? parts.at(-2)! : null, current: parts.at(-1)! };
}
