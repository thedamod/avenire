import type { ChunkKind, ChunkLocation } from "@avenire/contracts";

export type ChunkSection = { readonly text: string; readonly location: ChunkLocation };
export type Chunk = {
  readonly ordinal: number;
  readonly kind: ChunkKind;
  readonly content: string;
  readonly location: ChunkLocation;
  readonly tokenCount: number;
};

const estimate = (text: string) => Math.ceil(text.length / 4);
const classify = (text: string, transcript: boolean): ChunkKind => {
  if (transcript) return "transcript";
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
      for (let offset = 0; offset < oversizedWord.length; offset += step) result.push(oversizedWord.slice(offset, offset + width));
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
  options: { readonly targetTokens?: number; readonly maxTokens?: number; readonly overlapTokens?: number; readonly transcript?: boolean } = {},
): ReadonlyArray<Chunk> => {
  const target = options.targetTokens ?? 320;
  const max = options.maxTokens ?? 420;
  const overlap = options.overlapTokens ?? 48;
  const chunks: Array<Chunk> = [];
  for (const section of sections) {
    const paragraphs = section.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let pending: string[] = [];
    const flush = () => {
      if (!pending.length) return;
      const content = pending.join("\n\n");
      chunks.push({ ordinal: chunks.length, kind: classify(content, options.transcript ?? false), content, location: section.location, tokenCount: estimate(content) });
      pending = [];
    };
    for (const paragraph of paragraphs) {
      if (estimate(paragraph) > max) {
        flush();
        for (const content of splitOversized(paragraph, max, overlap)) {
          chunks.push({ ordinal: chunks.length, kind: classify(content, options.transcript ?? false), content, location: section.location, tokenCount: estimate(content) });
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
