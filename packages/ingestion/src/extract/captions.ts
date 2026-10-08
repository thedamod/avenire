import type { ExtractedDocument, SourceInput } from "./types.ts";
import { fullCoverage } from "./types.ts";
import { groupCues, type Cue } from "./transcript.ts";

const time = (value: string): number | undefined => {
  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim());
  if (!match) return undefined;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
};

/** Parses SRT and WebVTT blocks, including optional cue ids and VTT settings. */
export const parseCaptions = (text: string): ReadonlyArray<Cue> => {
  const blocks = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/);
  const cues: Array<Cue> = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0]?.trim() ?? "")) continue;
    const index = lines.findIndex((line) => line.includes(" --> "));
    if (index < 0) continue;
    const [from, right] = (lines[index] ?? "").split(" --> ");
    const startSec = time(from ?? "");
    const endSec = time(right?.split(/\s+/)[0] ?? "");
    if (startSec === undefined || endSec === undefined || endSec < startSec) continue;
    const cueText = lines
      .slice(index + 1)
      .join(" ")
      .trim();
    if (cueText) cues.push({ text: cueText, startSec, endSec });
  }
  return cues;
};

export const extractCaptions = (bytes: Uint8Array, source: SourceInput): ExtractedDocument => {
  const sections = groupCues(parseCaptions(new TextDecoder().decode(bytes)));
  return {
    title: source.title,
    sections,
    coverage: sections.length
      ? fullCoverage("transcript")
      : {
          status: "none",
          parts: [{ part: "transcript", status: "none", detail: "No valid caption cues" }],
        },
  };
};
