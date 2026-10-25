import type { ChatRow, WorkCall, WorkEntry, WorkIcon } from "./types.ts";

/** A report run may span several assistant messages; keep its activity in one block. */
export function combineRunActivity(rows: readonly ChatRow[]): readonly ChatRow[] {
  const work = rows.filter((row) => row.kind === "work");
  if (work.length < 2) return rows;
  const entries = work.flatMap((row) => row.entries);
  const combined = { ...work[0]!, entries, sig: JSON.stringify(entries) };
  return rows.flatMap<ChatRow>((row) =>
    row.kind !== "work" ? [row] : row === work[0] ? [combined] : [],
  );
}

const CATEGORIES: Record<
  string,
  { icon: WorkIcon; done: string; active: string; incomplete: string }
> = {
  explore: { icon: "search", done: "Explored", active: "Exploring", incomplete: "Exploration" },
  build: {
    icon: "code",
    done: "Prepared the result",
    active: "Working in the sandbox",
    incomplete: "Sandbox activity",
  },
  preview: {
    icon: "widget",
    done: "Checked the figure",
    active: "Checking the figure",
    incomplete: "Figure checks",
  },
  write: { icon: "write", done: "Saved files", active: "Saving files", incomplete: "File saves" },
  move: { icon: "move", done: "Moved files", active: "Moving files", incomplete: "File moves" },
  rename: {
    icon: "rename",
    done: "Renamed files",
    active: "Renaming files",
    incomplete: "File renames",
  },
  trash: {
    icon: "trash",
    done: "Moved files to Trash",
    active: "Moving files to Trash",
    incomplete: "Trash activity",
  },
  computer: {
    icon: "computer",
    done: "Used the computer",
    active: "Using the computer",
    incomplete: "Computer activity",
  },
};
const INTERNAL = new Set(["load_skill", "get_page_context", "sandbox_close"]);
function category(call: WorkCall, fallback: WorkIcon): string {
  switch (call.name) {
    case "hydrate_files":
    case "read_file":
    case "list_files":
    case "find_files":
    case "search_materials":
      return "explore";
    case "sandbox_write":
    case "box_write":
    case "sandbox_exec":
    case "box_exec":
    case "box_command_start":
    case "box_command_status":
    case "box_command_stop":
      return "build";
    case "sandbox_read":
    case "box_read":
      return "explore";
    case "preview_widget":
      return "preview";
    case "write_file":
    case "publish_output":
    case "publish_report":
      return "write";
    default:
      return fallback;
  }
}

/** Collapse repeated descriptions, retaining running work and failures as distinct states. */
export function groupWorkEntries(entries: readonly WorkEntry[]): WorkEntry[] {
  const groups = new Map<string, { entry: WorkEntry; calls: Map<string, WorkCall> }>();
  for (const entry of entries)
    for (const call of entry.calls) {
      if (INTERNAL.has(call.name) && call.status !== "error") continue;
      const key = category(call, entry.icon);
      let group = groups.get(key);
      if (!group) {
        group = { entry, calls: new Map() };
        groups.set(key, group);
      }
      group.calls.set(call.id, call);
    }
  return [...groups].map(([key, { entry, calls: indexed }]) => {
    const descriptions = new Map<string, WorkCall>();
    for (const call of indexed.values())
      descriptions.set(JSON.stringify([call.label, call.status, call.detail]), call);
    const calls = [...descriptions.values()];
    // A later successful attempt of the same tool resolves the group status,
    // while earlier diagnostics remain available in the expanded history.
    const latest = new Map<string, WorkCall>();
    for (const call of indexed.values()) latest.set(call.name, call);
    const status = calls.some((call) => call.status === "running")
      ? "running"
      : calls.some((call) => call.status === "waiting")
        ? "waiting"
        : [...latest.values()].some((call) => call.status === "error")
          ? "error"
          : "done";
    const config = CATEGORIES[key];
    return {
      id: key,
      icon: config?.icon ?? entry.icon,
      label:
        status === "error"
          ? (config?.incomplete ?? "Tool activity")
          : config
            ? status === "running"
              ? config.active
              : key === "build" && calls.length === 1
                ? calls[0]!.label
                : config.done
            : entry.label,
      detail: null,
      status,
      calls,
    };
  });
}

/** Count meaningful exploration actions, never internal retries or generic steps. */
export function activitySummary(entry: WorkEntry): string {
  if (entry.id !== "explore") return "";
  const counts = { read: 0, search: 0, list: 0 };
  for (const call of entry.calls) {
    if (["search_materials", "find_files"].includes(call.name)) counts.search++;
    else if (call.name === "list_files") counts.list++;
    else counts.read++;
  }
  return Object.entries(counts)
    .filter(([, n]) => n)
    .map(([name, n]) => `${n} ${name}${n === 1 ? "" : name === "search" ? "es" : "s"}`)
    .join(", ");
}
