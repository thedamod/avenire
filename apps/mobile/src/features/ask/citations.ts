import type { RuthUIMessage } from "@avenire/ai/message-types";
import { FileId } from "@avenire/contracts";
import { timestamp } from "../home/data";

export interface Citation {
  chunkId: string;
  fileId: FileId;
  title: string;
  page?: number;
  time?: number;
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
export function collectCitations(
  messages: readonly RuthUIMessage[],
): Map<string, Citation> {
  const map = new Map<string, Citation>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      const tool = record(part);
      if (tool?.state !== "output-available") continue;
      const name =
        tool.type === "dynamic-tool"
          ? tool.toolName
          : typeof tool.type === "string"
            ? tool.type.replace(/^tool-/, "")
            : "";
      const chunks =
        name === "search_materials"
          ? record(tool.output)?.hits
          : name === "read_file"
            ? tool.output
            : undefined;
      if (!Array.isArray(chunks)) continue;
      for (const raw of chunks) {
        const chunk = record(raw);
        if (
          !chunk ||
          typeof chunk.chunkId !== "string" ||
          typeof chunk.fileId !== "string" ||
          !chunk.fileId
        )
          continue;
        const location = record(chunk.location);
        const page = number(location?.page) ?? number(location?.slide);
        const time = number(location?.startSec);
        map.set(chunk.chunkId, {
          chunkId: chunk.chunkId,
          fileId: FileId.make(chunk.fileId),
          title:
            typeof chunk.title === "string"
              ? chunk.title
              : typeof chunk.fileTitle === "string"
                ? chunk.fileTitle
                : "Source",
          ...(page !== undefined ? { page } : {}),
          ...(time !== undefined ? { time } : {}),
        });
      }
    }
  }
  return map;
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function pattern(map: ReadonlyMap<string, Citation>) {
  const ids = [...map.keys()].sort((a, b) => b.length - a.length).map(escape);
  return ids.length ? new RegExp(ids.join("|"), "g") : null;
}
export function citedSources(
  markdown: string,
  map: ReadonlyMap<string, Citation>,
): Citation[] {
  const ids = pattern(map);
  if (!ids) return [];
  const found = new Map<string, Citation>();
  for (const match of markdown.matchAll(ids)) {
    const citation = map.get(match[0]);
    if (citation)
      found.set(
        `${citation.fileId}:${citation.page}:${citation.time}`,
        citation,
      );
  }
  return [...found.values()];
}
const token = "\u0000";
const tokenGroup = new RegExp(
  `[\\[(\`【]((?:\\s*(?:chunk(?:\\s*id)?:?\\s*)?${token}\\d+${token}\\s*[,;]?)+)[\\])\`】]`,
  "gi",
);
export function stripCitations(
  markdown: string,
  map: ReadonlyMap<string, Citation>,
): string {
  const ids = pattern(map);
  return ids
    ? markdown
        .replace(ids, `${token}0${token}`)
        .replace(tokenGroup, "")
        .replace(new RegExp(`${token}0${token}`, "g"), "")
        .replace(/\s+([.,;:!?])/g, "$1")
    : markdown;
}
export function citationLabel(citation: Citation) {
  const clean = citation.title.replace(/\.(pdf|docx?|pptx?|md|txt|csv)$/i, "");
  const title = clean.length > 28 ? `${clean.slice(0, 27)}…` : clean;
  return `${title}${citation.time !== undefined ? ` · ${timestamp(citation.time)}` : citation.page !== undefined ? ` · p.${citation.page}` : ""}`;
}
export function citationHref(citation: Citation) {
  return `/sources/${encodeURIComponent(citation.fileId)}${citation.time !== undefined ? `?t=${Math.floor(citation.time)}` : citation.page !== undefined ? `?page=${citation.page}` : ""}`;
}
export function answerMarkdown(
  answer: string,
  citations: readonly Citation[],
): string {
  return `${answer.trim()}${citations.length ? `\n\n---\n\nSources: ${citations.map((citation) => `[${citationLabel(citation)}](${citationHref(citation)})`).join(" · ")}` : ""}`;
}
