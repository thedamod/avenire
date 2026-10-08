import * as Effect from "effect/Effect";
import { fetchTranscript } from "youtube-transcript";

import { cleanCaptionText, groupCues } from "./transcript.ts";
import { type ExtractedDocument, ExtractionError, fullCoverage } from "./types.ts";

export { cleanCaptionText, groupCues } from "./transcript.ts";

export const toTimedCues = (
  cues: ReadonlyArray<{ text: string; offset: number; duration: number }>,
) => {
  const scale = cues.some((cue) => cue.offset > 10_000 || cue.duration > 1_000) ? 1000 : 1;
  return cues.map((cue) => ({
    text: cleanCaptionText(cue.text),
    startSec: cue.offset / scale,
    endSec: (cue.offset + cue.duration) / scale,
  }));
};

export const fetchYouTubeCues = (url: string) =>
  Effect.tryPromise({
    try: () => fetchTranscript(url),
    catch: (cause) => new ExtractionError({ source: "youtube", cause }),
  }).pipe(Effect.map(toTimedCues));

export const extractYouTube = (url: string): Effect.Effect<ExtractedDocument, ExtractionError> =>
  fetchYouTubeCues(url).pipe(
    Effect.map((cues) => {
      const sections = groupCues(cues);
      return {
        sections,
        coverage: sections.length
          ? fullCoverage("transcript")
          : {
              status: "none",
              parts: [{ part: "transcript", status: "none", detail: "No searchable captions" }],
            },
      };
    }),
  );
