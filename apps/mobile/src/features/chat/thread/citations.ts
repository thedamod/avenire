/**
 * Ruth cites the chunk ids its search/read tools return. The thread's tool outputs map those
 * ids to files and locations; prose rewrites each cited id into a `cite:` link that the
 * markdown renderer draws as a chip opening the source at the page or timestamp.
 */
import type { RuthUIMessage } from "@avenire/ai/message-types";

import { asToolPart, field, text, toolName } from "./toolParts";

export interface Citation {
  readonly chunkId: string;
  readonly fileId: string;
  readonly title: string;
  readonly page: number | null;
  readonly startSec: number | null;
  readonly slide: number | null;
  readonly region?: { x: number; y: number; width: number; height: number } | undefined;
}

export type CitationMap = ReadonlyMap<string, Citation>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fromChunk(chunk: unknown): Citation | null {
  const chunkId = text(chunk, "chunkId");
  const fileId = text(chunk, "fileId");
  if (!chunkId || !fileId) return null;
  const location = field(chunk, "location");
  return {
    chunkId,
    fileId,
    title: text(chunk, "title") ?? text(chunk, "fileTitle") ?? "Source",
    page: num(field(location, "page")),
    startSec: num(field(location, "startSec")),
    slide: num(field(location, "slide")),
    region: regionOf(field(location, "region")),
  };
}

function regionOf(value: unknown) {
  const x = field(value, "x"), y = field(value, "y"), width = field(value, "width"), height = field(value, "height");
  return typeof x === "number" && typeof y === "number" && typeof width === "number" && typeof height === "number" && [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

/** Every chunk the thread's search/read calls returned, by chunk id. */
export function collectCitations(messages: readonly RuthUIMessage[]): Map<string, Citation> {
  const map = new Map<string, Citation>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      const tool = asToolPart(part);
      if (!tool || tool.state !== "output-available") continue;
      const name = toolName(tool);
      const output = tool.output;
      const chunks =
        name === "search_materials"
          ? field(output, "hits")
          : name === "read_file"
            ? output
            : undefined;
      if (!Array.isArray(chunks)) continue;
      for (const chunk of chunks) {
        const citation = fromChunk(chunk);
        if (citation) map.set(citation.chunkId, citation);
      }
    }
  }
  return map;
}

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function citationHref(citation: Citation): string {
  const base = `/sources/${encodeURIComponent(citation.fileId)}`;
  if (citation.startSec !== null) return `${base}?t=${Math.floor(citation.startSec)}`;
  if (citation.page !== null) return `${base}?page=${citation.page}`;
  if (citation.slide !== null) return `${base}?page=${citation.slide}`;
  return base;
}

function shortTitle(title: string): string {
  const clean = title.replace(/\.(pdf|docx?|pptx?|md|txt|csv)$/i, "");
  return clean.length > 28 ? `${clean.slice(0, 27)}…` : clean;
}

export function citationLabel(citation: Citation): string {
  const where =
    citation.startSec !== null
      ? formatTimestamp(citation.startSec)
      : citation.page !== null
        ? `p.${citation.page}`
        : citation.slide !== null
          ? `slide ${citation.slide}`
          : null;
  return where ? `${shortTitle(citation.title)} · ${where}` : shortTitle(citation.title);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new WeakMap<CitationMap, RegExp | null>();

function idPattern(map: CitationMap): RegExp | null {
  if (patterns.has(map)) return patterns.get(map)!;
  const ids = [...map.keys()].sort((a, b) => b.length - a.length).map(escape);
  const pattern = ids.length ? new RegExp(ids.join("|"), "g") : null;
  patterns.set(map, pattern);
  return pattern;
}

const TOKEN = "\u0000";
const TOKEN_GROUP = new RegExp(
  `[\\[(\`【]((?:\\s*(?:chunk(?:\\s*id)?:?\\s*)?${TOKEN}\\d+${TOKEN}\\s*[,;]?)+)[\\])\`】]`,
  "gi",
);

/** Rewrite cited chunk ids (bare, `[id]`, `(id, id)`, `` `id` ``) into `cite:` markdown links. */
export function linkCitations(markdown: string, map: CitationMap): string {
  const pattern = idPattern(map);
  if (!pattern || !markdown) return markdown;
  const found: string[] = [];
  const tokenised = markdown.replace(pattern, (id) => {
    found.push(id);
    return `${TOKEN}${found.length - 1}${TOKEN}`;
  });
  if (!found.length) return markdown;
  return tokenised
    .replace(TOKEN_GROUP, (_, inner: string) => inner)
    .replace(
      new RegExp(`(?:chunk(?:\\s*id)?:?\\s*)?${TOKEN}(\\d+)${TOKEN}[,;]?`, "gi"),
      (_, index: string) => {
        const citation = map.get(found[Number(index)]!)!;
        return ` [${citationLabel(citation).replace(/[[\]]/g, "")}](cite:${citation.chunkId})`;
      },
    );
}

/** The distinct sources a reply cites, in order of first citation. */
export function citedSources(markdown: string, map: CitationMap): Citation[] {
  const pattern = idPattern(map);
  if (!pattern) return [];
  const seen = new Map<string, Citation>();
  for (const match of markdown.matchAll(pattern)) {
    const citation = map.get(match[0]);
    if (citation && !seen.has(`${citation.fileId}:${citation.page}:${citation.startSec}`))
      seen.set(`${citation.fileId}:${citation.page}:${citation.startSec}`, citation);
  }
  return [...seen.values()];
}

/** Plain text of a reply with citations removed (for the ephemeral sentence view). */
export function stripCitations(markdown: string, map: CitationMap): string {
  const pattern = idPattern(map);
  if (!pattern) return markdown;
  return markdown
    .replace(pattern, `${TOKEN}0${TOKEN}`)
    .replace(TOKEN_GROUP, "")
    .replace(new RegExp(`${TOKEN}0${TOKEN}`, "g"), "")
    .replace(/\s+([.,;:!?])/g, "$1");
}
