import type { RuthPart, WorkCall, WorkEntry, WorkIcon, WorkStatus } from "./types.ts";

/** A tool part read structurally, so labels work for every Ruth tool without a type per tool. */
export interface LooseToolPart {
  readonly type: string;
  readonly toolCallId: string;
  readonly state: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
  readonly approval?: {
    readonly id: string;
    readonly approved?: boolean;
    readonly reason?: string;
  };
}

export function asToolPart(part: RuthPart): LooseToolPart | null {
  if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") return null;
  return part as unknown as LooseToolPart;
}

export function toolName(part: LooseToolPart): string {
  if (part.type === "dynamic-tool") {
    const name = (part as unknown as { toolName?: unknown }).toolName;
    return typeof name === "string" ? name : "tool";
  }
  return part.type.slice("tool-".length);
}

export function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function text(value: unknown, key: string): string | undefined {
  const found = field(value, key);
  return typeof found === "string" && found.trim() ? found : undefined;
}

export function quote(value: string | undefined, max = 60): string {
  if (!value) return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return `“${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}”`;
}

/** Tools whose consecutive calls fold into one "Explored N files" entry. */
export const LOOKUP_TOOLS = new Set(["search_materials", "read_file", "list_files", "find_files"]);
/** Tools whose results render as media rows rather than work entries. */
export const MEDIA_TOOLS = new Set(["render_widget", "publish_asset"]);
/** Library-changing tools: approvals and the inline request one-liner. */
export const FILE_ACTION_TOOLS = new Set([
  "write_file",
  "move_file",
  "rename_file",
  "archive_file",
]);

export function statusOf(part: LooseToolPart): WorkStatus {
  switch (part.state) {
    case "output-available":
      if (
        field(part.output, "ok") === false ||
        (typeof field(part.output, "exitCode") === "number" && field(part.output, "exitCode") !== 0)
      )
        return "error";
      return "done";
    case "output-denied":
    case "approval-responded":
      return "done";
    case "output-error":
      return "error";
    case "approval-requested":
      return "waiting";
    default:
      return "running";
  }
}

const running = (part: LooseToolPart) => statusOf(part) === "running";

/** File ids a lookup tool touched, for the folded "Explored N files" count. */
export function lookupFileIds(part: LooseToolPart): string[] {
  const output = part.output;
  const ids: string[] = [];
  const add = (value: unknown) => {
    const id = text(value, "fileId");
    if (id) ids.push(id);
  };
  if (Array.isArray(output)) output.forEach(add);
  const hits = field(output, "hits");
  if (Array.isArray(hits)) hits.forEach(add);
  const files = field(output, "files");
  if (Array.isArray(files)) files.forEach(add);
  const inputId = text(part.input, "fileId");
  if (inputId) ids.push(inputId);
  return ids;
}

function readTitle(part: LooseToolPart): string | undefined {
  const output = part.output;
  if (Array.isArray(output)) return text(output[0], "title");
  return undefined;
}

/** One line describing a lookup call, used both standalone and inside a folded entry. */
function lookupLine(part: LooseToolPart): string {
  const name = toolName(part);
  const busy = running(part);
  if (name === "search_materials") {
    const hits = field(part.output, "hits");
    const count = Array.isArray(hits) ? hits.length : 0;
    const q = quote(text(part.input, "query"));
    return busy ? `Exploring for ${q}` : `Explored for ${q} · ${count} ${plural(count, "match")}`;
  }
  if (name === "read_file") {
    const title = readTitle(part);
    return busy ? "Reading a file" : `Read ${title ?? "a file"}`;
  }
  if (name === "find_files") return busy ? "Finding files" : "Found files in your library";
  return busy ? "Looking through your library" : "Looked through your library";
}

export function plural(count: number, word: string): string {
  if (count === 1) return word;
  return word.endsWith("ch") || word.endsWith("s") ? `${word}es` : `${word}s`;
}

function workCall(part: LooseToolPart, label: string, detail: string | null = null): WorkCall {
  return {
    id: part.toolCallId,
    name: toolName(part),
    label,
    detail,
    status: statusOf(part),
  };
}

/** Folds a run of consecutive lookup calls into one entry. */
export function lookupEntry(parts: readonly LooseToolPart[]): WorkEntry {
  const first = parts[0]!;
  if (parts.length === 1) {
    const name = toolName(first);
    return {
      id: first.toolCallId,
      icon: name === "search_materials" ? "search" : name === "read_file" ? "read" : "list",
      label: lookupLine(first),
      detail: null,
      status: statusOf(first),
      calls: [workCall(first, lookupLine(first))],
    };
  }
  const files = new Set(parts.flatMap(lookupFileIds));
  const busy = parts.some(running);
  const failed = parts.some((part) => statusOf(part) === "error");
  const n = files.size;
  const label =
    n === 0
      ? busy
        ? "Exploring your material…"
        : "Explored your material"
      : busy
        ? `Exploring ${n} ${plural(n, "file")}…`
        : `Explored ${n} ${plural(n, "file")}`;
  return {
    id: `${first.toolCallId}:lookup`,
    icon: "search",
    label,
    detail: parts.map(lookupLine).join("\n"),
    status: busy ? "running" : failed ? "error" : "done",
    calls: parts.map((part) => workCall(part, lookupLine(part))),
  };
}

const ICONS: Record<string, WorkIcon> = {
  write_file: "write",
  move_file: "move",
  rename_file: "rename",
  archive_file: "trash",
  sandbox_exec: "code",
  sandbox_write: "code",
  sandbox_read: "read",
  sandbox_close: "code",
  preview_widget: "widget",
  render_widget: "widget",
  publish_asset: "image",
  screen_record: "video",
  computer: "computer",
  screen_read: "computer",
  load_skill: "skill",
  get_page_context: "page",
  ask_user: "question",
  hydrate_files: "read",
  publish_output: "write",
  publish_report: "write",
};

function summary(part: LooseToolPart): string | undefined {
  return text(part.output, "summary");
}

/** A work-log line for a non-lookup tool call. */
export function toolEntry(part: LooseToolPart): WorkEntry {
  const name = toolName(part);
  const busy = running(part);
  const icon: WorkIcon = ICONS[name] ?? (name.startsWith("box_") ? "code" : "tool");
  let label: string;
  let detail: string | null = null;
  switch (name) {
    case "write_file":
      label =
        summary(part) ??
        `${busy ? "Writing" : "Wrote"} a note ${quote(text(part.input, "title"))}`.trim();
      break;
    case "move_file":
      label = summary(part) ?? (busy ? "Moving a file" : "Moved a file");
      break;
    case "rename_file":
      label =
        summary(part) ??
        `${busy ? "Renaming" : "Renamed"} a file to ${quote(text(part.input, "title"))}`;
      break;
    case "archive_file":
      label = summary(part) ?? (busy ? "Moving a file to Trash" : "Moved a file to Trash");
      break;
    case "sandbox_exec":
    case "box_exec":
    case "box_command_start": {
      label = busy ? "Running a computation" : "Ran a computation";
      break;
    }
    case "sandbox_write":
    case "box_write":
      label = `${busy ? "Writing" : "Wrote"} ${fileName(text(part.input, "path")) ?? "a file"}`;
      break;
    case "sandbox_read":
    case "box_read":
      label = `${busy ? "Reading" : "Read"} ${fileName(text(part.input, "path")) ?? "a file"}`;
      break;
    case "hydrate_files": {
      const files = field(part.output, "files");
      const count = Array.isArray(files) ? files.length : 0;
      label = busy
        ? "Gathering your material"
        : `Gathered ${count} ${count === 1 ? "file" : "files"} from your library`;
      detail = Array.isArray(files)
        ? files
            .map((file) => text(file, "drivePath"))
            .filter(Boolean)
            .join("\n")
        : null;
      break;
    }
    case "publish_output": {
      const title = quote(text(part.input, "title")) || fileName(text(part.input, "sandboxPath"));
      label =
        text(part.output, "kind") === "sync"
          ? `${busy ? "Proposing" : "Proposed"} changes to ${title ?? "a file"}`
          : `${busy ? "Saving" : "Saved"} ${title ?? "a file"}`;
      break;
    }
    case "publish_report":
      label = busy ? "Writing the report" : "Wrote the report";
      break;
    case "preview_widget":
      label = busy ? "Previewing the figure" : "Previewed the figure";
      break;
    case "render_widget":
      label = `${busy ? "Building" : "Built"} ${quote(text(part.input, "title")) || "a figure"}`;
      break;
    case "publish_asset":
      label = `${busy ? "Publishing" : "Published"} ${text(part.output, "name") ?? text(part.input, "title") ?? "a file"}`;
      break;
    case "screen_record":
      label =
        text(part.input, "action") === "stop" ? "Saved a screen recording" : "Recording the screen";
      break;
    case "computer": {
      const action = text(part.input, "action") ?? "action";
      label = `Used the computer · ${action.replaceAll("_", " ")}`;
      break;
    }
    case "screen_read":
      label = "Read the screen";
      break;
    case "load_skill":
      label = busy ? "Preparing" : "Prepared the task";
      break;
    case "get_page_context":
      label = "Checked the page layout";
      break;
    case "sandbox_close":
      label = "Closed the sandbox";
      break;
    default:
      label = `${busy ? "Running" : "Ran"} ${name.replaceAll("_", " ")}`;
  }
  const activity = text(part.output, "activity")?.replace(/\s+/g, " ").trim().slice(0, 96);
  if (activity && statusOf(part) === "done") label = activity;
  if (statusOf(part) === "error") {
    label = name === "preview_widget" ? "Figure needs another check" : `${label} · failed`;
    detail =
      part.errorText ??
      (name === "preview_widget"
        ? "The figure did not pass its preview checks."
        : "The computation returned an unsuccessful result.");
  }
  if (part.state === "output-denied") label = `Declined · ${label}`;
  return {
    id: part.toolCallId,
    icon,
    label,
    detail: detail || null,
    status: statusOf(part),
    calls: [workCall(part, label, detail || null)],
  };
}

/** Sandbox paths are long; the work log shows the file name. */
function fileName(path: string | undefined): string | undefined {
  return path?.split("/").filter(Boolean).at(-1);
}

/** The muted one-liner a request (approval or question) leaves in the thread. */
export function requestLine(part: LooseToolPart): {
  label: string;
  state: "waiting" | "approved" | "declined" | "answered";
} {
  const name = toolName(part);
  if (name === "ask_user") {
    if (part.state === "output-available") {
      const answers = field(part.output, "answers");
      const answer = Array.isArray(answers) ? answers.join(", ") : "";
      return { label: `Answered ${quote(answer, 80)}`, state: "answered" };
    }
    return { label: "Waiting for your answer", state: "waiting" };
  }
  const action = actionPhrase(part);
  if (part.state === "approval-requested")
    return { label: `Waiting for you to approve ${action}`, state: "waiting" };
  if (part.state === "output-denied" || part.approval?.approved === false)
    return { label: `You declined ${action}`, state: "declined" };
  return { label: summary(part) ?? `Approved ${action}`, state: "approved" };
}

export function actionPhrase(part: LooseToolPart): string {
  switch (toolName(part)) {
    case "write_file":
      return `creating ${quote(text(part.input, "title")) || "a note"}`;
    case "move_file":
      return "moving a file";
    case "rename_file":
      return `renaming a file to ${quote(text(part.input, "title"))}`;
    case "archive_file":
      return "moving a file to Trash";
    default:
      return toolName(part).replaceAll("_", " ");
  }
}
