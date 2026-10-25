/**
 * Messages → display rows. Pure: React only ever sees the rows this produces.
 *
 * - Each assistant message splits into rows at block boundaries (prose, work, media, request,
 *   error) so long answers virtualise well and a figure's height change re-measures one row.
 * - Consecutive search/read calls fold into one "Explored N files" entry; errors, requests and
 *   media are never folded.
 * - `stabilizeRows` keeps the previous row object when nothing in it changed, so memoised row
 *   components skip rendering; the streaming short-circuit only re-derives the last message.
 */
import type { RuthUIMessage } from "@avenire/ai/message-types";

import {
  FILE_ACTION_TOOLS,
  LOOKUP_TOOLS,
  MEDIA_TOOLS,
  asToolPart,
  field,
  lookupEntry,
  requestLine,
  text,
  toolEntry,
  toolName,
  type LooseToolPart,
} from "./toolParts.ts";
import type {
  AttachmentChip,
  ChatRow,
  DeriveRowsInput,
  MediaItem,
  TurnTiming,
  WorkEntry,
} from "./types.ts";

const ACTIVE = new Set(["submitted", "streaming"]);

function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function userRow(message: RuthUIMessage): ChatRow {
  const textParts: string[] = [];
  const attachments: AttachmentChip[] = [];
  for (const part of message.parts) {
    if (part.type === "text") textParts.push(part.text);
    else if (part.type === "file")
      attachments.push({
        name: part.filename ?? "Attachment",
        mediaType: part.mediaType,
        url: part.url,
      });
  }
  return {
    kind: "user",
    id: message.id,
    messageId: message.id,
    text: textParts.join("\n\n"),
    attachments,
    sig: JSON.stringify(attachments),
  };
}

function mediaFromTool(part: LooseToolPart, figure: () => number): MediaItem | null {
  const name = toolName(part);
  if (part.state === "output-error" || part.state === "output-denied") return null;
  if (name === "render_widget") {
    const url = text(part.output, "url");
    const title = text(part.output, "title") ?? text(part.input, "title") ?? "Figure";
    if (part.state === "output-available" && url)
      return { kind: "widget", id: part.toolCallId, url, title, figure: figure() };
    return { kind: "pending", id: part.toolCallId, title };
  }
  if (name === "publish_asset") {
    if (part.state !== "output-available")
      return {
        kind: "pending",
        id: part.toolCallId,
        title: text(part.input, "title") ?? "Rendering",
      };
    const url = text(part.output, "url") ?? "";
    const mediaType = text(part.output, "mediaType") ?? "application/octet-stream";
    const title = text(part.output, "name") ?? text(part.input, "title") ?? "File";
    if (mediaType.startsWith("image/") || mediaType.startsWith("video/"))
      return {
        kind: mediaType.startsWith("image/") ? "image" : "video",
        id: part.toolCallId,
        url,
        title,
        figure: figure(),
        durationSec: null,
      };
    const size = field(part.output, "sizeBytes");
    return {
      kind: "file",
      id: part.toolCallId,
      url,
      title,
      mediaType,
      sizeBytes: typeof size === "number" ? size : null,
    };
  }
  return null;
}

function recordingFromTool(part: LooseToolPart, figure: () => number): MediaItem | null {
  if (toolName(part) !== "screen_record" || part.state !== "output-available") return null;
  if (text(part.output, "action") !== "stop") return null;
  const url = text(part.output, "url");
  if (!url) return null;
  const duration = field(part.output, "durationSeconds");
  return {
    kind: "video",
    id: part.toolCallId,
    url,
    title: text(part.input, "label") ?? "Screen recording",
    figure: figure(),
    durationSec: typeof duration === "number" ? duration : null,
  };
}

interface MessageRows {
  readonly rows: readonly ChatRow[];
  readonly figures: number;
}

interface MessageContext {
  readonly active: boolean;
  readonly figureStart: number;
  readonly expanded: boolean | undefined;
  readonly timing: TurnTiming | undefined;
  /** Start of the running turn; an active message without its own timing uses it. */
  readonly turnStartedAt: number | null;
}

/** Rows for one assistant message. Exported for tests. */
export function assistantRows(message: RuthUIMessage, context: MessageContext): MessageRows {
  const mid = message.id;
  let figures = 0;
  const nextFigure = () => context.figureStart + ++figures;
  type Block =
    | { type: "work"; entries: WorkEntry[] }
    | { type: "row"; row: ChatRow }
    | { type: "thought"; row: ChatRow };
  const blocks: Block[] = [];
  let lookups: LooseToolPart[] = [];
  let work: WorkEntry[] = [];
  let media: MediaItem[] = [];

  const flushLookups = () => {
    if (lookups.length) work.push(lookupEntry(lookups));
    lookups = [];
  };
  const flushWork = () => {
    flushLookups();
    if (work.length) blocks.push({ type: "work", entries: work });
    work = [];
  };
  const flushMedia = () => {
    if (media.length)
      blocks.push({
        type: "row",
        row: {
          kind: "media",
          id: `${mid}:m:${media[0]!.id}`,
          messageId: mid,
          items: media,
          sig: JSON.stringify(media),
        },
      });
    media = [];
  };
  const emit = (row: ChatRow) => {
    flushWork();
    flushMedia();
    blocks.push({ type: "row", row });
  };

  message.parts.forEach((part, index) => {
    if (part.type === "step-start") return;
    if (part.type === "text") {
      if (!part.text.trim()) return;
      emit({
        kind: "prose",
        id: `${mid}:p${index}`,
        messageId: mid,
        text: part.text,
        streaming: context.active && part.state === "streaming",
      });
      return;
    }
    if (part.type === "reasoning") {
      if (!part.text.trim()) return;
      flushWork();
      flushMedia();
      blocks.push({
        type: "thought",
        row: {
          kind: "reasoning",
          id: `${mid}:r${index}`,
          messageId: mid,
          text: part.text,
          streaming: context.active && part.state === "streaming",
        },
      });
      return;
    }
    if (part.type === "file") {
      if (!part.mediaType.startsWith("image/")) return;
      flushWork();
      media.push({
        kind: "image",
        id: `${mid}:f${index}`,
        url: part.url,
        title: part.filename ?? "Image",
        figure: nextFigure(),
        durationSec: null,
      });
      return;
    }
    if (part.type === "data-subagent") {
      const data = part.data;
      emit({
        kind: "subagent",
        id: `${mid}:s:${data.subagentId}`,
        messageId: mid,
        label: `Video agent · ${data.stage ?? data.status}`,
        progress: data.progress ?? null,
      });
      return;
    }
    if (part.type === "data-cloud-run") {
      emit({
        kind: "cloud-run",
        id: `${mid}:c:${part.data.runId}`,
        messageId: mid,
        runId: part.data.runId,
      });
      return;
    }
    const tool = asToolPart(part);
    if (!tool) return;
    const name = toolName(tool);
    const isRequest =
      name === "ask_user" ||
      (FILE_ACTION_TOOLS.has(name) &&
        (tool.approval !== undefined ||
          tool.state === "approval-requested" ||
          tool.state === "approval-responded" ||
          tool.state === "output-denied"));
    if (isRequest && tool.state !== "output-error") {
      const line = requestLine(tool);
      emit({
        kind: "request",
        id: `${mid}:q:${tool.toolCallId}`,
        messageId: mid,
        label: line.label,
        state: line.state,
      });
      return;
    }
    // Tool failures return control to Ruth, which can retry or choose another
    // approach. Keep their diagnostics in activity; only turn failures are alerts.
    if (tool.state === "output-error") {
      flushMedia();
      flushLookups();
      work.push(toolEntry(tool));
      return;
    }
    if (MEDIA_TOOLS.has(name)) {
      const item = mediaFromTool(tool, nextFigure);
      if (item) {
        flushWork();
        media.push(item);
      }
      return;
    }
    const recording = recordingFromTool(tool, nextFigure);
    if (recording) {
      flushWork();
      media.push(recording);
      return;
    }
    flushMedia();
    if (LOOKUP_TOOLS.has(name)) {
      lookups.push(tool);
      return;
    }
    if (["load_skill", "get_page_context", "sandbox_close"].includes(name)) return;
    flushLookups();
    work.push(toolEntry(tool));
  });
  flushWork();
  flushMedia();

  const steps = blocks.reduce(
    (sum, block) => sum + (block.type === "work" ? block.entries.length : 0),
    0,
  );
  // Keep tool activity visible as it streams and after completion. The reader can still fold it.
  const expanded = context.expanded ?? true;
  const entries = blocks.flatMap((block) => (block.type === "work" ? block.entries : []));
  const rows: ChatRow[] = [];
  let headerPlaced = false;
  let workPlaced = false;
  for (const block of blocks) {
    if (block.type === "row" || (block.type === "thought" && steps === 0)) {
      rows.push(block.row);
      continue;
    }
    // Thinking between tool calls is part of the work: under the header, folded with it.
    if (!headerPlaced) {
      headerPlaced = true;
      const metadata = message.metadata as unknown;
      rows.push({
        kind: "work-header",
        id: `${mid}:h`,
        messageId: mid,
        active: context.active,
        startedAt:
          context.timing?.startedAt ??
          (context.active ? context.turnStartedAt : null) ??
          parseTime(field(metadata, "createdAt")),
        finishedAt: context.timing?.finishedAt ?? parseTime(field(metadata, "finishedAt")),
        steps,
        expanded,
      });
    }
    if (block.type === "thought") {
      if (expanded) rows.push(block.row);
      continue;
    }
    if (expanded && !workPlaced) {
      workPlaced = true;
      rows.push({
        kind: "work",
        id: `${mid}:w:${entries[0]!.id}`,
        messageId: mid,
        entries,
        sig: JSON.stringify(entries),
      });
    }
  }
  return { rows, figures };
}

function lastToolName(message: RuthUIMessage | undefined): string | null {
  if (!message || message.role !== "assistant") return null;
  for (let index = message.parts.length - 1; index >= 0; index--) {
    const tool = asToolPart(message.parts[index]!);
    if (tool) return toolName(tool);
  }
  return null;
}

const cache = new WeakMap<RuthUIMessage, { key: string; result: MessageRows }>();

function rowsForMessage(message: RuthUIMessage, context: MessageContext): MessageRows {
  if (message.role === "user") return { rows: [userRow(message)], figures: 0 };
  if (message.role !== "assistant") return { rows: [], figures: 0 };
  const key = `${context.figureStart}|${context.expanded}|${context.active}|${context.timing?.startedAt}|${context.timing?.finishedAt}|${context.active ? context.turnStartedAt : ""}`;
  const hit = cache.get(message);
  if (hit && hit.key === key) return hit.result;
  const result = assistantRows(message, context);
  cache.set(message, { key, result });
  return result;
}

/** Derive display rows for a whole thread. Unchanged messages hit a per-message cache. */
export function deriveRows(input: DeriveRowsInput): ChatRow[] {
  const rows: ChatRow[] = [];
  let figures = 0;
  const last = input.messages.at(-1);
  const active = ACTIVE.has(input.status);
  for (const message of input.messages) {
    const result = rowsForMessage(message, {
      active: active && message === last,
      figureStart: figures,
      expanded: input.workExpanded.get(message.id),
      timing: input.timings.get(message.id),
      turnStartedAt: input.turnStartedAt,
    });
    figures += result.figures;
    for (const row of result.rows) rows.push(row);
  }
  if (active) {
    const visible =
      last?.role === "assistant" &&
      rows.some((row) => row.kind !== "thinking" && row.messageId === last.id);
    if (!visible)
      rows.push({
        kind: "thinking",
        id: `thinking:${last?.id ?? "start"}`,
        startedAt: input.turnStartedAt,
        lastTool: lastToolName(last),
      });
  }
  if (input.status === "error" && input.error)
    rows.push({
      kind: "error",
      id: `error:${last?.id ?? "start"}`,
      messageId: last?.id ?? "",
      text: input.error,
    });
  return rows;
}

/** Rows with array fields carry a `sig`; everything else compares by value. */
export function rowsEqual(a: ChatRow, b: ChatRow): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind || a.id !== b.id) return false;
  const left = a as unknown as Record<string, unknown>;
  const right = b as unknown as Record<string, unknown>;
  for (const key in left) {
    const value = left[key];
    if (Array.isArray(value)) continue;
    if (value !== right[key]) return false;
  }
  return true;
}

/** Reuse the previous row object wherever nothing changed; return `prev` itself if identical. */
export function stabilizeRows(
  prev: readonly ChatRow[],
  next: readonly ChatRow[],
): readonly ChatRow[] {
  if (prev === next) return prev;
  const byId = new Map<string, ChatRow>();
  for (const row of prev) byId.set(row.id, row);
  let same = prev.length === next.length;
  const out = next.map((row, index) => {
    const old = byId.get(row.id);
    const kept = old && rowsEqual(old, row) ? old : row;
    if (same && prev[index] !== kept) same = false;
    return kept;
  });
  return same ? prev : out;
}

function onlyLastMessageChanged(prev: DeriveRowsInput, next: DeriveRowsInput): boolean {
  if (
    prev.status !== next.status ||
    prev.workExpanded !== next.workExpanded ||
    prev.timings !== next.timings ||
    prev.turnStartedAt !== next.turnStartedAt ||
    prev.error !== next.error ||
    prev.messages.length !== next.messages.length ||
    next.messages.length === 0
  )
    return false;
  const end = next.messages.length - 1;
  if (prev.messages[end]!.id !== next.messages[end]!.id) return false;
  for (let index = 0; index < end; index++)
    if (prev.messages[index] !== next.messages[index]) return false;
  return true;
}

/**
 * Stateful wrapper used by the timeline: full derive + stabilize normally, and the streaming
 * short-circuit (only the last message's rows are rebuilt and spliced in) while a reply streams.
 */
export function createRowsDeriver() {
  let lastInput: DeriveRowsInput | undefined;
  let lastRows: readonly ChatRow[] = [];
  return (input: DeriveRowsInput): readonly ChatRow[] => {
    if (lastInput === input) return lastRows;
    let next: readonly ChatRow[];
    if (lastInput && onlyLastMessageChanged(lastInput, input)) {
      next = replaceStreamingMessageRows(lastRows, input);
    } else {
      next = stabilizeRows(lastRows, deriveRows(input));
    }
    lastInput = input;
    lastRows = next;
    return next;
  };
}

/** Rebuild only the last message's rows (plus trailing thinking/error rows) and splice them in. */
export function replaceStreamingMessageRows(
  prev: readonly ChatRow[],
  input: DeriveRowsInput,
): readonly ChatRow[] {
  const lastId = input.messages.at(-1)!.id;
  let start = prev.findIndex((row) => row.kind === "thinking" || row.messageId === lastId);
  if (start === -1) start = prev.length;
  // Figures before the last message keep their numbers; count them from the kept prefix.
  let figures = 0;
  for (let index = 0; index < start; index++) {
    const row = prev[index]!;
    if (row.kind === "media") figures += row.items.filter((item) => "figure" in item).length;
  }
  const tail = deriveRows({ ...input, messages: input.messages.slice(-1) }).map((row) =>
    row.kind === "media" && figures > 0 ? renumber(row, figures) : row,
  );
  const prefix = prev.slice(0, start);
  const stableTail = stabilizeRows(prev.slice(start), tail);
  if (
    stableTail.length === prev.length - start &&
    stableTail.every((row, i) => row === prev[start + i])
  )
    return prev;
  return [...prefix, ...stableTail];
}

function renumber(row: Extract<ChatRow, { kind: "media" }>, offset: number): ChatRow {
  const items = row.items.map((item) =>
    "figure" in item ? { ...item, figure: item.figure + offset } : item,
  );
  return { ...row, items, sig: JSON.stringify(items) };
}
