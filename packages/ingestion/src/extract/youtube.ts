import * as Effect from "effect/Effect";
import { fetchTranscript } from "youtube-transcript";

import { type ExtractedDocument, ExtractionError } from "./types.ts";

/** Transcript cues are grouped into sections of about this many seconds. */
const SECTION_SECONDS = 60;

type Cue = Awaited<ReturnType<typeof fetchTranscript>>[number];
type TimedSection = { text: string; location: { startSec: number; endSec: number } };

export const isYouTubeUrl = (url: string | null): boolean =>
  url !== null && /(?:youtube\.com|youtu\.be)/i.test(url);

/** Groups consecutive cues into roughly minute-long sections with their time range. */
const groupCues = (cues: ReadonlyArray<Cue>): ReadonlyArray<TimedSection> => {
  // Depending on the video, offsets come back in seconds or milliseconds.
  const scale = cues.some((cue) => cue.offset > 10_000 || cue.duration > 1_000) ? 1000 : 1;
  const sections: Array<TimedSection> = [];
  let current: TimedSection | undefined;
  for (const cue of cues) {
    const startSec = cue.offset / scale;
    const endSec = (cue.offset + cue.duration) / scale;
    if (current === undefined || startSec - current.location.startSec >= SECTION_SECONDS) {
      current = { text: cue.text, location: { startSec, endSec } };
      sections.push(current);
    } else {
      current.text += ` ${cue.text}`;
      current.location.endSec = endSec;
    }
  }
  return sections;
};

export const extractYouTube = (url: string): Effect.Effect<ExtractedDocument, ExtractionError> =>
  Effect.tryPromise({
    try: () => fetchTranscript(url),
    catch: (cause) => new ExtractionError({ source: "youtube", cause }),
  }).pipe(Effect.map((cues) => ({ sections: groupCues(cues) })));
