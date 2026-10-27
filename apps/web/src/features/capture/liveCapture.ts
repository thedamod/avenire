import type { FileKind, LibraryFile } from "@avenire/contracts";
import type { CaptureProgress, CaptureStarted } from "@avenire/desktop/bridge";
import type { CaptureReceipt } from "./receipt";

export type CaptureRowStatus = CaptureProgress["status"];

export interface CaptureRow {
  readonly key: string;
  readonly title: string;
  readonly kind: FileKind;
  readonly status: CaptureRowStatus;
  readonly file?: LibraryFile | undefined;
  readonly reason?: string | undefined;
}

/** One hotkey press as the toast shows it: rows stream in, then the final receipt settles it. */
export interface LiveCapture {
  readonly id: string;
  readonly rows: readonly CaptureRow[];
  /** Last applied progress `seq`; replays after a reload or re-ready never go backwards. */
  readonly seq: number;
  readonly receipt?: CaptureReceipt | undefined;
}

const KINDS: ReadonlySet<string> = new Set<FileKind>([
  "pdf",
  "document",
  "web-page",
  "video",
  "audio",
  "image",
  "selection",
]);
const fileKind = (kind: string | undefined): FileKind =>
  kind && KINDS.has(kind) ? (kind as FileKind) : "document";

const empty = (id: string): LiveCapture => ({ id, rows: [], seq: 0 });

/** `capture-started`: every item pending. A replay keeps rows that already moved on. */
export function startCapture(previous: LiveCapture | undefined, started: CaptureStarted) {
  const base = previous?.id === started.id ? previous : empty(started.id);
  const known = new Set(base.rows.map((row) => row.key));
  const added = started.items
    .filter((item) => !known.has(item.key))
    .map((item): CaptureRow => ({
      key: item.key,
      title: item.title,
      kind: fileKind(item.kind),
      status: "pending",
    }));
  return added.length ? { ...base, rows: [...base.rows, ...added] } : base;
}

/** `capture-progress`, in `seq` order. Late items (a document path resolved later) join at the end. */
export function applyProgress(previous: LiveCapture | undefined, event: CaptureProgress) {
  const base = previous?.id === event.id ? previous : empty(event.id);
  if (event.seq <= base.seq) return base;
  const index = base.rows.findIndex((row) => row.key === event.key);
  const before = base.rows[index];
  const row: CaptureRow = {
    key: event.key,
    title: event.file?.title ?? event.title ?? before?.title ?? "Untitled",
    kind: event.file?.kind ?? (event.kind ? fileKind(event.kind) : (before?.kind ?? "document")),
    status: event.status,
    file: event.file ?? before?.file,
    reason: event.status === "skipped" || event.status === "failed" ? event.reason : undefined,
  };
  const rows =
    index === -1 ? [...base.rows, row] : base.rows.map((item, at) => (at === index ? row : item));
  return { ...base, seq: event.seq, rows };
}

const BLOCKED: Record<CaptureReceipt["blocked"][number]["category"], string> = {
  email: "email",
  banking: "banking",
  messaging: "messaging",
  "password-manager": "password manager",
  checkout: "checkout",
  "social-feed": "social feed",
  "drm-stream": "protected stream",
  "private-window": "private window",
};

/**
 * The final payload was submitted. Its files are the uploads (already rows) plus what the server
 * captured from URLs: those settle the rows that were waiting on it, matched by title.
 */
export function settleCapture(
  previous: LiveCapture | undefined,
  id: string,
  receipt: CaptureReceipt,
): LiveCapture {
  const rows = [...(previous?.id === id ? previous.rows : [])];
  const placed = new Set(rows.flatMap((row) => (row.file ? [row.file.id] : [])));
  const waiting = (title: string) => rows.findIndex((row) => !row.file && row.title === title);
  for (const file of receipt.files) {
    if (placed.has(file.id)) continue;
    placed.add(file.id);
    const index = waiting(file.title);
    const row: CaptureRow = {
      key: rows[index]?.key ?? `file:${file.id}`,
      title: file.title,
      kind: file.kind,
      status: "saved",
      file,
    };
    if (index === -1) rows.push(row);
    else rows[index] = row;
  }
  for (const [at, skip] of receipt.skipped.entries()) {
    const index = waiting(skip.title);
    const before = rows[index];
    // Upload skips arrive twice: as progress and again in the receipt.
    if (before?.reason === skip.reason) continue;
    const row: CaptureRow = {
      key: before?.key ?? `skipped:${at}`,
      title: skip.title,
      kind: before?.kind ?? "document",
      status: before?.status === "failed" ? "failed" : "skipped",
      reason: skip.reason,
    };
    if (index === -1) rows.push(row);
    else rows[index] = row;
  }
  for (const [at, item] of receipt.blocked.entries())
    rows.push({
      key: `blocked:${at}`,
      title: item.title,
      kind: "web-page",
      status: "skipped",
      reason: `Not captured · ${BLOCKED[item.category]}`,
    });
  return { id, rows, seq: previous?.id === id ? previous.seq : 0, receipt };
}

const captures = new Map<string, LiveCapture>();
const listeners = new Set<() => void>();

export function updateLiveCapture(
  id: string,
  update: (previous: LiveCapture | undefined) => LiveCapture,
) {
  const previous = captures.get(id);
  const next = update(previous);
  if (next === previous) return next;
  captures.set(id, next);
  // Keep the last few presses: enough for replays, never a growing log.
  for (const key of [...captures.keys()].slice(0, -5)) captures.delete(key);
  for (const listener of listeners) listener();
  return next;
}

export function getLiveCapture(id: string) {
  return captures.get(id);
}

export function subscribeLiveCaptures(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
