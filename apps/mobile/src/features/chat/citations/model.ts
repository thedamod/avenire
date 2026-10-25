import type { FileId, RuthMessage } from "@avenire/contracts";
import type { RootStackParamList } from "../../../navigation";

export type CitationTarget = RootStackParamList["Citation"];
export interface Citation extends CitationTarget {
  key: string;
  title: string;
  passage?: string;
}
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const string = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;
const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

export function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function citationLabel(citation: Citation): string {
  const title = citation.title.replace(/\.(pdf|md|docx?|pptx?)$/i, "");
  const where =
    citation.time !== undefined
      ? timestamp(citation.time)
      : citation.page
        ? `p.${citation.page}`
        : null;
  return `${title.length > 28 ? `${title.slice(0, 27)}…` : title}${where ? ` · ${where}` : ""}`;
}

/** Same search_materials/read_file chunk mapping as the web citation renderer. */
export function collectCitations(
  messages: readonly Pick<RuthMessage, "parts">[],
): Map<string, Citation> {
  const citations = new Map<string, Citation>();
  for (const message of messages)
    for (const raw of message.parts) {
      const part = object(raw);
      if (part.state !== "output-available") continue;
      const tool =
        part.type === "dynamic-tool" ? part.toolName : String(part.type).replace(/^tool-/, "");
      const chunks =
        tool === "search_materials"
          ? object(part.output).hits
          : tool === "read_file"
            ? part.output
            : undefined;
      if (!Array.isArray(chunks)) continue;
      for (const rawChunk of chunks) {
        const chunk = object(rawChunk);
        const key = string(chunk.chunkId);
        const sourceId = string(chunk.fileId);
        if (!key || !sourceId) continue;
        const location = object(chunk.location);
        const page = finite(location.page ?? location.slide);
        const time = finite(location.startSec);
        const passage = string(chunk.text ?? chunk.content ?? chunk.snippet);
        citations.set(key, {
          key,
          sourceId: sourceId as FileId,
          title: string(chunk.title ?? chunk.fileTitle) ?? "Source",
          ...(page && page >= 1 ? { page: Math.floor(page) } : {}),
          ...(time !== undefined ? { time } : {}),
          ...(passage ? { passage } : {}),
        });
      }
    }
  return citations;
}

export function sourceLink(href: string, title: string): Citation | undefined {
  try {
    const url = new URL(href, "https://avenire.invalid");
    const match = /^\/sources\/([^/]+)$/.exec(url.pathname);
    if (!match) return;
    const page = Number(url.searchParams.get("page"));
    const rawTime = url.searchParams.get("t");
    const time = rawTime === null ? undefined : Number(rawTime);
    const values = url.searchParams.get("region")?.split(",").map(Number);
    const region =
      values?.length === 4
        ? clampRegion({
            x: values[0]!,
            y: values[1]!,
            width: values[2]!,
            height: values[3]!,
          })
        : undefined;
    const passage = string(url.searchParams.get("q"));
    return {
      key: href,
      title,
      sourceId: decodeURIComponent(match[1]!) as FileId,
      ...(Number.isFinite(page) && page >= 1 ? { page: Math.floor(page) } : {}),
      ...(time !== undefined && Number.isFinite(time) && time >= 0 ? { time } : {}),
      ...(region ? { region } : {}),
      ...(passage ? { passage } : {}),
    };
  } catch {
    return;
  }
}

export function clampRegion(region: CitationTarget["region"]): CitationTarget["region"] {
  if (!region || Object.values(region).some((value) => !Number.isFinite(value))) return;
  const x = Math.max(0, Math.min(1, region.x));
  const y = Math.max(0, Math.min(1, region.y));
  const width = Math.max(0, Math.min(1 - x, region.width));
  const height = Math.max(0, Math.min(1 - y, region.height));
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

// A sheet opened from an output can carry the exact chunk text without changing shared routes.
// Bounded, transient, and never persisted; a direct/deep link still opens at its route target.
const focuses = new Map<string, Citation>();
const focusKey = (target: CitationTarget) =>
  `${target.sourceId}:${target.page ?? ""}:${target.time ?? ""}`;
export function rememberCitation(citation: Citation): void {
  if (focuses.size >= 32) focuses.delete(focuses.keys().next().value!);
  focuses.set(focusKey(citation), citation);
}
export function citationFocus(target: CitationTarget): Citation | undefined {
  return focuses.get(focusKey(target));
}

export function youtubeId(value: string | null): string | undefined {
  try {
    const url = new URL(value ?? "");
    const host = url.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : ["youtube.com", "youtube-nocookie.com"].includes(host)
          ? (url.searchParams.get("v") ??
            /^\/(?:embed|shorts|live)\/([\w-]+)/.exec(url.pathname)?.[1])
          : undefined;
    return id && /^[\w-]+$/.test(id) ? id : undefined;
  } catch {
    return;
  }
}
