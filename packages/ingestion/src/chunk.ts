import type { ChunkKind, ChunkLocation } from "@avenire/contracts";

export type ChunkSection = {
  readonly text: string;
  readonly location: ChunkLocation;
  /** Overrides the inferred kind for every chunk of the section (transcript, slide, figure). */
  readonly kind?: ChunkKind;
};
export type Chunk = {
  readonly ordinal: number;
  readonly kind: ChunkKind;
  readonly content: string;
  readonly location: ChunkLocation;
  readonly tokenCount: number;
};

export const formatTimestamp = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`;
};

/** Where a chunk sits, as a short marker: `[mm:ss]`, `(p. 3)`, `(slide 4)`, `(sheet Scores)`. */
const locationMarker = ({ startSec, page, slide, sheet }: ChunkLocation): string => {
  if (startSec !== undefined) return ` [${formatTimestamp(startSec)}]`;
  if (slide !== undefined) return ` (slide ${slide})`;
  if (page !== undefined) return ` (p. ${page})`;
  if (sheet !== undefined) return ` (sheet ${sheet})`;
  return "";
};

/** The text embedded and reranked for a chunk: its file title, heading and location first. */
export const embeddingText = (
  title: string,
  chunk: { readonly content: string; readonly location: ChunkLocation },
): string => {
  const heading = chunk.location.heading ? ` › ${chunk.location.heading}` : "";
  return `${title}${heading}${locationMarker(chunk.location)}\n${chunk.content}`;
};

const estimate = (text: string) => Math.ceil(text.length / 4);
const classify = (text: string): ChunkKind => {
  if (/^\s*proof\b/i.test(text)) return "proof";
  if (/\b(?:is defined as|we define)\b/i.test(text)) return "definition";
  if (/^\s*example\b|\be\.g\.|\bfor instance\b/i.test(text)) return "example";
  if ((text.match(/=/g)?.length ?? 0) >= 4) return "derivation";
  return "concept";
};

const splitOversized = (paragraph: string, maxTokens: number, overlapTokens: number): string[] => {
  const words = paragraph.trim().split(/\s+/);
  const result: string[] = [];
  let start = 0;
  while (start < words.length) {
    const oversizedWord = words[start];
    if (oversizedWord && estimate(oversizedWord) > maxTokens) {
      const width = maxTokens * 4;
      const step = Math.max(1, width - overlapTokens * 4);
      for (let offset = 0; offset < oversizedWord.length; offset += step)
        result.push(oversizedWord.slice(offset, offset + width));
      start++;
      continue;
    }
    let end = start;
    let text = "";
    while (end < words.length) {
      const word = words[end] ?? "";
      const next = text.length ? `${text} ${word}` : word;
      if (estimate(next) > maxTokens && end > start) break;
      text = next;
      end++;
      if (estimate(text) >= maxTokens) break;
    }
    result.push(text);
    if (end >= words.length) break;
    let overlapStart = end;
    while (overlapStart > start) {
      const candidateStart = overlapStart - 1;
      if (estimate(words.slice(candidateStart, end).join(" ")) > overlapTokens) break;
      overlapStart = candidateStart;
    }
    start = Math.max(start + 1, overlapStart);
  }
  return result;
};

export const chunkSections = (
  sections: ReadonlyArray<ChunkSection>,
  options: {
    readonly targetTokens?: number;
    readonly maxTokens?: number;
    readonly overlapTokens?: number;
  } = {},
): ReadonlyArray<Chunk> => {
  const target = options.targetTokens ?? 320;
  const max = options.maxTokens ?? 420;
  const overlap = options.overlapTokens ?? 48;
  const chunks: Array<Chunk> = [];
  for (const section of sections) {
    const paragraphs = section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    let pending: string[] = [];
    const flush = () => {
      if (!pending.length) return;
      const content = pending.join("\n\n");
      chunks.push({
        ordinal: chunks.length,
        kind: section.kind ?? classify(content),
        content,
        location: section.location,
        tokenCount: estimate(content),
      });
      pending = [];
    };
    for (const paragraph of paragraphs) {
      if (estimate(paragraph) > max) {
        flush();
        for (const content of splitOversized(paragraph, max, overlap)) {
          chunks.push({
            ordinal: chunks.length,
            kind: section.kind ?? classify(content),
            content,
            location: section.location,
            tokenCount: estimate(content),
          });
        }
        continue;
      }
      const candidate = [...pending, paragraph].join("\n\n");
      if (pending.length && estimate(candidate) > target) flush();
      pending.push(paragraph);
    }
    flush();
  }
  return chunks;
};
