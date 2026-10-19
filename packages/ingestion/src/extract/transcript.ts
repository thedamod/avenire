import type { ExtractedSection } from "./types.ts";

export interface Cue {
  readonly text: string;
  readonly startSec: number;
  readonly endSec: number;
}

/** Decodes caption markup without discarding short words, symbols or numbers. */
export const cleanCaptionText = (text: string): string => {
  let value = text;
  for (let pass = 0; pass < 3; pass++) {
    value = value
      .replace(/&amp;/gi, "&")
      .replace(/&#(\d+);/g, (match, digits: string) => {
        const codepoint = Number(digits);
        return codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : match;
      })
      .replace(/&#x([\da-f]+);/gi, (match, digits: string) => {
        const codepoint = Number.parseInt(digits, 16);
        return codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : match;
      })
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }
  return value
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(
      /\[(?:music|applause|laughter|inaudible|cheering|sighs?)\]|\((?:laughs?|laughter|applause|sighs?|music|inaudible)\)/gi,
      " ",
    )
    .replace(/[\p{Cc}\ufffd]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/** Removes only repeated words at an overlapping clip boundary. */
export const stitchCues = (cues: ReadonlyArray<Cue>): ReadonlyArray<Cue> => {
  const ordered = [...cues].sort((a, b) => a.startSec - b.startSec);
  const result: Array<Cue> = [];
  for (const cue of ordered) {
    const previous = result.at(-1);
    if (!previous || cue.startSec >= previous.endSec - 0.1) {
      result.push(cue);
      continue;
    }
    const before = previous.text.split(/\s+/);
    const after = cue.text.split(/\s+/);
    let duplicate = 0;
    for (let count = Math.min(before.length, after.length); count > 0; count--) {
      if (
        before.slice(-count).join(" ").toLowerCase() ===
        after.slice(0, count).join(" ").toLowerCase()
      ) {
        duplicate = count;
        break;
      }
    }
    const text = after.slice(duplicate).join(" ");
    if (text) result.push({ ...cue, text });
  }
  return result;
};

/** Makes 45–60 second transcript windows with about ten seconds of cue overlap. */
export const groupCues = (cues: ReadonlyArray<Cue>): ReadonlyArray<ExtractedSection> => {
  const cleaned = cues
    .map((cue) => ({ ...cue, text: cleanCaptionText(cue.text) }))
    .filter((cue) => cue.text.length > 0 && cue.endSec >= cue.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const sections: Array<ExtractedSection> = [];
  let start = 0;
  while (start < cleaned.length) {
    const first = cleaned[start];
    if (!first) break;
    let end = start;
    let last = first;
    while (end + 1 < cleaned.length) {
      const next = cleaned[end + 1];
      if (!next) break;
      if (last.endSec - first.startSec >= 45 && next.startSec - last.endSec >= 1.5) break;
      if (next.endSec - first.startSec > 60) break;
      end++;
      last = next;
    }
    sections.push({
      text: cleaned
        .slice(start, end + 1)
        .map((cue) => cue.text)
        .join(" "),
      location: { startSec: first.startSec, endSec: last.endSec },
      kind: "transcript",
    });
    if (end === cleaned.length - 1) break;
    let nextStart = end + 1;
    for (let index = start + 1; index <= end; index++) {
      const cue = cleaned[index];
      if (cue && cue.startSec >= last.endSec - 10) {
        nextStart = index;
        break;
      }
    }
    start = nextStart;
  }
  return sections;
};
