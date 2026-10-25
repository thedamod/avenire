/**
 * A Ruth Cloud run → the morning report's view model. Pure: the page feeds it the run, the
 * run's UI message stream, the approvals and the library index, and renders what it returns.
 *
 * What a run produces (packages/ai/src/cloud/tools.ts):
 * - `hydrate_files` outputs: the library files Ruth read (the report's sources).
 * - `publish_output` outputs: `{ kind: "file", fileId }` for a new library file in the run's
 *   "Ruth Cloud · …" notebook (notes, quiz.json, flashcards.json…), or
 *   `{ kind: "sync", approvalId }` for a proposed change to an existing file (morning review).
 * - `publish_report`: the markdown summary (`run.summary`) and assets (`run.assets`).
 */
import type { RuthUIMessage } from "@avenire/ai/message-types";
import type {
  Asset,
  FileId,
  Folder,
  FolderId,
  LibraryFile,
  PendingApproval,
} from "@avenire/contracts";

import { asToolPart, field, text, toolName } from "../../chat/logic/toolParts.ts";
import type { CitationTarget } from "../../sources/citation.ts";

export interface PublishedFile {
  readonly fileId: FileId;
  /** Title from the tool call; the library's title wins once the file is listed. */
  readonly title: string;
}

export interface ProposedChange {
  readonly approvalId: string;
  /** The file the proposal replaces. */
  readonly fileId: FileId | null;
  readonly title: string | null;
  readonly conflict: string | null;
}

export interface RunProducts {
  readonly published: readonly PublishedFile[];
  readonly proposals: readonly ProposedChange[];
  /** Files hydrated into the box, first read first. */
  readonly hydrated: readonly FileId[];
}

const basename = (path: string) => path.split("/").at(-1) ?? path;

/** Everything the run's tool calls produced, in order, deduplicated. */
export function runProducts(messages: readonly RuthUIMessage[]): RunProducts {
  const published = new Map<string, PublishedFile>();
  const proposals = new Map<string, ProposedChange>();
  const hydrated = new Set<FileId>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      const tool = asToolPart(part);
      if (!tool || tool.state !== "output-available") continue;
      const name = toolName(tool);
      if (name === "hydrate_files") {
        const files = field(tool.output, "files");
        if (Array.isArray(files))
          for (const file of files) {
            const id = text(file, "fileId");
            if (id) hydrated.add(id as FileId);
          }
      } else if (name === "publish_output") {
        const kind = text(tool.output, "kind");
        if (kind === "file") {
          const fileId = text(tool.output, "fileId");
          if (!fileId) continue;
          const title =
            text(tool.input, "title") ??
            basename(text(tool.output, "drivePath") ?? text(tool.input, "sandboxPath") ?? "File");
          published.set(fileId, { fileId: fileId as FileId, title });
        } else if (kind === "sync") {
          const approvalId = text(tool.output, "approvalId");
          if (!approvalId) continue;
          const conflict = field(tool.output, "conflict");
          proposals.set(approvalId, {
            approvalId,
            fileId: (text(tool.input, "replaces") as FileId | undefined) ?? null,
            title: text(tool.input, "title") ?? null,
            conflict: typeof conflict === "string" ? conflict : null,
          });
        }
      }
    }
  }
  return {
    published: [...published.values()],
    proposals: [...proposals.values()],
    hydrated: [...hydrated],
  };
}

/** Run status buckets the page cares about. */
export function runPhase(status: string): "running" | "done" | "failed" | "cancelled" {
  if (status === "succeeded") return "done";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "running";
}

// --- Tabs -------------------------------------------------------------------------------------

export type OutputTab =
  | {
      readonly kind: "note";
      readonly key: string;
      readonly fileId: FileId;
      readonly title: string;
      readonly label: string;
    }
  | {
      readonly kind: "quiz";
      readonly key: string;
      readonly fileId: FileId;
      readonly title: string;
      readonly label: string;
    }
  | {
      readonly kind: "widget";
      readonly key: string;
      readonly url: string;
      readonly title: string;
      readonly label: string;
      readonly createdAt: string;
    }
  | {
      /** A source the run read, a citation the user opened, or an output we can only show raw. */
      readonly kind: "source";
      readonly key: string;
      readonly fileId: FileId;
      readonly title: string;
      readonly label: string;
      readonly target: CitationTarget;
      /** Opened from a citation: the tab can be closed. */
      readonly transient: boolean;
    };

const EXTENSION = /\.(pdf|md|markdown|txt|json|html?|docx?|pptx?|csv|png|jpe?g|webp|mp4|webm)$/i;

/** "Summary: Entropy and the second law" → "Summary"; "Lecture 7 · Entropy….pdf" → "Lecture 7". */
export function tabLabel(title: string): string {
  const clean = title.replace(EXTENSION, "").trim() || title;
  const head = clean.split(/\s*[:·|—–]\s+|\s+-\s+/)[0]!.trim() || clean;
  if (head.length <= 16) return head;
  const words = head.split(/\s+/);
  let label = words[0]!;
  for (const word of words.slice(1)) {
    if (`${label} ${word}`.length > 14) break;
    label = `${label} ${word}`;
  }
  return label.length > 18 ? `${label.slice(0, 17)}…` : label;
}

export function isJsonOutput(file: { title: string; mimeType?: string | null }): boolean {
  return file.mimeType === "application/json" || /\.json$/i.test(file.title);
}

/** Quiz outputs are JSON files; the content decides (see quiz.ts). Name hints keep the label stable. */
export function looksLikeQuiz(title: string): boolean {
  return /quiz|questions|test yourself/i.test(title);
}

export interface TabInputs {
  readonly products: RunProducts;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
  readonly assets: readonly Asset[];
  /** JSON outputs that parsed as a quiz (true), didn't (false), or are still loading (absent). */
  readonly quizzes: ReadonlyMap<FileId, boolean>;
  /** Citation tabs the user opened, newest last. */
  readonly opened: readonly Extract<OutputTab, { kind: "source" }>[];
}

/** The right pane's tabs: notes, quiz, other outputs, widgets, then the main source read. */
export function outputTabs({
  products,
  fileById,
  assets,
  quizzes,
  opened,
}: TabInputs): OutputTab[] {
  const notes: OutputTab[] = [];
  const quizTabs: OutputTab[] = [];
  const others: OutputTab[] = [];
  for (const output of products.published) {
    const file = fileById.get(output.fileId);
    if (file?.placement === "archived") continue;
    const title = file?.title ?? output.title;
    const base = { key: `file:${output.fileId}`, fileId: output.fileId, title };
    if (file?.kind === "note" || (!file && /\.(md|markdown|txt)$/i.test(output.title))) {
      notes.push({ kind: "note", ...base, label: tabLabel(title) });
    } else if (isJsonOutput({ title, mimeType: file?.mimeType ?? null })) {
      const quiz = quizzes.get(output.fileId);
      if (quiz === true || (quiz === undefined && looksLikeQuiz(title)))
        quizTabs.push({ kind: "quiz", ...base, label: "Quiz" });
      else if (quiz === false)
        others.push({
          kind: "source",
          ...base,
          label: tabLabel(title),
          target: {},
          transient: false,
        });
    } else {
      others.push({
        kind: "source",
        ...base,
        label: tabLabel(title),
        target: {},
        transient: false,
      });
    }
  }
  const widgets: OutputTab[] = assets
    .filter((asset) => asset.kind === "widget")
    .map((asset) => ({
      kind: "widget",
      key: `asset:${asset.id}`,
      url: asset.url,
      title: asset.title,
      label: tabLabel(asset.title),
      createdAt: asset.createdAt,
    }));
  const tabs: OutputTab[] = [...notes.slice(0, 1), ...quizTabs, ...notes.slice(1), ...others];
  tabs.push(...widgets);
  // The main source the run read: the first PDF or video, the way 08 shows "Lecture 7".
  const source = products.hydrated
    .map((id) => fileById.get(id))
    .find((file) => file && (file.kind === "pdf" || file.kind === "video"));
  const keys = new Set(tabs.map((tab) => tab.key));
  if (source && !keys.has(`file:${source.id}`)) {
    tabs.push({
      kind: "source",
      key: `file:${source.id}`,
      fileId: source.id,
      title: source.title,
      label: tabLabel(source.title),
      target: {},
      transient: false,
    });
    keys.add(`file:${source.id}`);
  }
  for (const tab of opened) {
    const existing = tabs.findIndex((item) => item.kind === "source" && item.fileId === tab.fileId);
    // A citation into a source that already has a tab re-targets that tab.
    if (existing >= 0) tabs[existing] = { ...tab, key: tabs[existing]!.key, transient: false };
    else tabs.push(tab);
  }
  return tabs;
}

/** The tab the report opens on: Ruth's first note, else the first output. */
export function mainTab(tabs: readonly OutputTab[]): OutputTab | undefined {
  return tabs.find((tab) => tab.kind === "note") ?? tabs[0];
}

/** Ruth's "start with…" pointer, if her summary has one. */
export function startHere(summary: string | null): string | null {
  if (!summary) return null;
  const plain = summary
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*|__|\*|_/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s.*$/gm, "");
  const sentences = plain.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim());
  return sentences.find((sentence) => /^(start (here|with)|begin with)\b/i.test(sentence)) ?? null;
}

/** The notebook the run studied: most common notebook among the files it read. */
export function reportNotebook(
  products: RunProducts,
  fileById: ReadonlyMap<FileId, LibraryFile>,
  folderById: ReadonlyMap<FolderId, Folder>,
): Folder | undefined {
  const counts = new Map<FolderId, number>();
  for (const id of products.hydrated)
    for (const folderId of fileById.get(id)?.folderIds ?? [])
      counts.set(folderId, (counts.get(folderId) ?? 0) + 1);
  const best = [...counts.entries()]
    .filter(([id]) => folderById.get(id)?.archivedAt === null)
    .sort((a, b) => b[1] - a[1])[0];
  if (best) return folderById.get(best[0]);
  for (const output of products.published)
    for (const folderId of fileById.get(output.fileId)?.folderIds ?? []) {
      const folder = folderById.get(folderId);
      if (folder && folder.archivedAt === null) return folder;
    }
  return undefined;
}

// --- File changes ------------------------------------------------------------------------------

export type ChangeStatus = "pending" | "conflict" | "accepted" | "skipped" | "resolved";

export interface FileChange {
  readonly approvalId: string;
  readonly fileId: FileId | null;
  readonly title: string;
  readonly detail: string | null;
  readonly status: ChangeStatus;
}

export interface FileChanges {
  readonly rows: readonly FileChange[];
  readonly waiting: number;
  readonly accepted: number;
  readonly skipped: number;
  /** Legacy proposal absent from the server response. */
  readonly reviewed: number;
}

/**
 * Proposals from the stream joined with durable approval statuses and this session's
 * decisions. Older responses that only list open approvals retain the "resolved" fallback.
 */
export function fileChanges(input: {
  readonly proposals: readonly ProposedChange[];
  readonly open: readonly PendingApproval[] | undefined;
  readonly decided: ReadonlyMap<string, "accepted" | "skipped">;
  readonly fileById: ReadonlyMap<FileId, LibraryFile>;
}): FileChanges {
  const open = new Map((input.open ?? []).map((approval) => [approval.id as string, approval]));
  const ids = [
    ...input.proposals.map((proposal) => proposal.approvalId),
    ...(input.open ?? []).map((approval) => approval.id as string),
  ];
  const rows: FileChange[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const approval = open.get(id);
    const proposal = input.proposals.find((item) => item.approvalId === id);
    const fileId = (approval?.fileId ?? proposal?.fileId ?? null) as FileId | null;
    const title =
      approval?.fileTitle ??
      (fileId ? input.fileById.get(fileId)?.title : undefined) ??
      proposal?.title ??
      "A file";
    const decided = input.decided.get(id);
    const status: ChangeStatus =
      decided ?? (approval ? approval.status : input.open === undefined ? "pending" : "resolved");
    const conflict = approval?.conflict ?? proposal?.conflict ?? null;
    const summary = approval?.summary ?? null;
    rows.push({
      approvalId: id,
      fileId,
      title,
      detail: status === "conflict" && conflict ? conflict : summary,
      status,
    });
  }
  return {
    rows,
    waiting: rows.filter((row) => row.status === "pending" || row.status === "conflict").length,
    accepted: rows.filter((row) => row.status === "accepted").length,
    skipped: rows.filter((row) => row.status === "skipped").length,
    reviewed: rows.filter((row) => row.status === "resolved").length,
  };
}

/** "1 accepted, 2 waiting". */
export function changesMeta(changes: FileChanges, separator = ", "): string {
  const parts = [
    changes.accepted ? `${changes.accepted} accepted` : null,
    changes.skipped ? `${changes.skipped} skipped` : null,
    changes.reviewed ? `${changes.reviewed} reviewed` : null,
    changes.waiting ? `${changes.waiting} waiting` : null,
  ].filter(Boolean);
  return parts.join(separator);
}

// --- Follow-ups ------------------------------------------------------------------------------

function cloudRunIds(message: RuthUIMessage): string[] {
  const ids: string[] = [];
  for (const part of message.parts) if (part.type === "data-cloud-run") ids.push(part.data.runId);
  return ids;
}

/**
 * The follow-ups that belong to this run in the user's single Ruth Cloud thread: everything
 * after the run's report message up to the next run's report, plus whatever this page sent
 * (`sentFrom`, the thread length at the first send), which lands at the thread's end.
 */
export function followUps(
  messages: readonly RuthUIMessage[],
  runId: string,
  sentFrom: number | null,
  reportMessageId?: string | null,
): RuthUIMessage[] {
  const taken = new Set<number>();
  const explicit = messages.findIndex((message) => message.id === reportMessageId);
  const report =
    explicit >= 0
      ? explicit
      : messages.findIndex((message) => cloudRunIds(message).includes(runId));
  if (report >= 0)
    for (let index = report + 1; index < messages.length; index++) {
      if (cloudRunIds(messages[index]!).length) break;
      taken.add(index);
    }
  if (sentFrom !== null)
    for (let index = Math.max(0, sentFrom); index < messages.length; index++) {
      if (taken.has(index) || cloudRunIds(messages[index]!).length) continue;
      taken.add(index);
    }
  // Explicit metadata wins over legacy position-based grouping, including interleaved runs.
  return messages.filter((message, index) =>
    message.metadata?.runId !== undefined
      ? message.metadata.runId === runId && !cloudRunIds(message).length
      : taken.has(index),
  );
}

// --- Dates -----------------------------------------------------------------------------------

/** "Tue, Oct 14". */
export function reportDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "5:48 AM". */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
