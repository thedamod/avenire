import * as Effect from "effect/Effect";
import { fetchTranscript } from "youtube-transcript";

import { type ExtractedDocument, ExtractionError } from "./types.ts";

const SOFT_SECONDS = 45;
const HARD_SECONDS = 60;
const GAP_SECONDS = 1.5;
const OVERLAP_SECONDS = 10;

type Cue = Awaited<ReturnType<typeof fetchTranscript>>[number];
type TimedSection = { text: string; location: { startSec: number; endSec: number } };

export const isYouTubeUrl = (url: string | null): boolean =>
  url !== null && /(?:youtube\.com|youtu\.be)/i.test(url);

/** Decodes caption markup and removes non-speech cues without discarding symbols or numbers. */
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

/** Groups cleaned captions into timed sections with a short overlap. */
export const groupCues = (cues: ReadonlyArray<Cue>): ReadonlyArray<TimedSection> => {
  // Depending on the video, offsets come back in seconds or milliseconds.
  const scale = cues.some((cue) => cue.offset > 10_000 || cue.duration > 1_000) ? 1000 : 1;
  const cleaned = cues
    .map((cue) => ({
      text: cleanCaptionText(cue.text),
      startSec: cue.offset / scale,
      endSec: (cue.offset + cue.duration) / scale,
    }))
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.startSec - b.startSec);
  const sections: Array<TimedSection> = [];
  let start = 0;
  while (start < cleaned.length) {
    const first = cleaned[start];
    if (!first) break;
    let end = start;
    let last = first;
    while (end + 1 < cleaned.length) {
      const next = cleaned[end + 1];
      if (!next) break;
      const duration = last.endSec - first.startSec;
      if (duration >= SOFT_SECONDS && next.startSec - last.endSec >= GAP_SECONDS) break;
      if (next.endSec - first.startSec > HARD_SECONDS) break;
      end++;
      last = next;
    }
    sections.push({
      text: cleaned
        .slice(start, end + 1)
        .map((cue) => cue.text)
        .join(" "),
      location: { startSec: first.startSec, endSec: last.endSec },
    });
    if (end === cleaned.length - 1) break;
    let nextStart = end + 1;
    for (let index = start + 1; index <= end; index++) {
      const cue = cleaned[index];
      if (cue && cue.startSec >= last.endSec - OVERLAP_SECONDS) {
        nextStart = index;
        break;
      }
    }
    start = nextStart;
  }
  return sections;
};

export const extractYouTube = (url: string): Effect.Effect<ExtractedDocument, ExtractionError> =>
  Effect.tryPromise({
    try: () => fetchTranscript(url),
    catch: (cause) => new ExtractionError({ source: "youtube", cause }),
  }).pipe(Effect.map((cues) => ({ sections: groupCues(cues) })));
