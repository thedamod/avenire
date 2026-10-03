import * as Effect from "effect/Effect";
import { fetchTranscript } from "youtube-transcript";
import type { ExtractedDocument } from "./types.ts";
import { ExtractionError } from "./types.ts";

export const isYouTubeUrl = (url: string | null) =>
  !!url && /(?:youtube\.com|youtu\.be)/i.test(url);

export const extractYouTube = (url: string): Effect.Effect<ExtractedDocument, ExtractionError> =>
  Effect.tryPromise({
    try: () => fetchTranscript(url),
    catch: (cause) => new ExtractionError({ source: "youtube", cause }),
  }).pipe(
    Effect.map((cues) => {
      const sections: Array<{ text: string; location: { startSec: number; endSec: number } }> = [];
      const milliseconds = cues.some((cue) => cue.offset > 10_000 || cue.duration > 1_000);
      let group: typeof cues = [];
      let start = 0;
      let end = 0;
      for (const cue of cues) {
        const scale = milliseconds ? 1000 : 1;
        const cueStart = cue.offset / scale;
        const cueEnd = (cue.offset + cue.duration) / scale;
        if (group.length && cueStart - start >= 60) {
          sections.push({
            text: group.map((part) => part.text).join(" "),
            location: { startSec: start, endSec: end },
          });
          group = [];
        }
        if (!group.length) start = cueStart;
        group.push(cue);
        end = cueEnd;
      }
      if (group.length)
        sections.push({
          text: group.map((part) => part.text).join(" "),
          location: { startSec: start, endSec: end },
        });
      return { sections };
    }),
  );
