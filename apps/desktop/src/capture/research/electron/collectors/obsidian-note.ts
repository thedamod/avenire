import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { captureAppData, captureConfigHome } from "../../../../config.ts";

// Obsidian (Electron) doesn't keep its open note as an OS file handle, so
// handle scans structurally miss it. Instead: read Obsidian's own config —
// obsidian.json lists known vaults, and each vault's .obsidian/workspace.json
// records the active leaf. Pure FS reads, no permissions, all three OSes.
function obsidianConfigDir(): string | undefined {
  if (process.platform === "win32") {
    return captureAppData ? join(captureAppData, "obsidian") : undefined;
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "obsidian");
  }
  const xdg = captureConfigHome;
  return join(xdg ? xdg : join(homedir(), ".config"), "obsidian");
}

function readJson(p: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

// workspace.json: { active: <leaf-id>, main: { children: [tabs[/splits…]] } },
// leaves look like { id, type: 'leaf', state: { type: 'markdown',
// state: { file: 'Notes/x.md' } } }. Walk generically; match the active id.
export function activeFileFromWorkspace(ws: unknown): string | undefined {
  const { active, leaves } = collectLeaves(ws);
  if (active) {
    const hit = leaves.find((l) => l.id === active);
    if (hit?.file) return hit.file;
  }
  // No active pointer (older/dirty state): single markdown leaf wins.
  const md = leaves.filter((l) => l.file);
  if (md.length === 1) return md[0]!.file;
  return undefined;
}

// Every open markdown leaf (all tabs/panes), active first. Powers the
// editorTabs list — the active note alone can't represent open-tabs capture.
export function openNotesFromWorkspace(ws: unknown): string[] {
  const { active, leaves } = collectLeaves(ws);
  const files = leaves.map((l) => l.file).filter((f): f is string => !!f);
  const ordered = [...new Set(files)];
  if (!active) return ordered;
  const activeFile = leaves.find((l) => l.id === active)?.file;
  if (!activeFile) return ordered;
  return [activeFile, ...ordered.filter((f) => f !== activeFile)];
}

function collectLeaves(ws: unknown): { active?: string; leaves: { id?: string; file?: string }[] } {
  if (!ws || typeof ws !== "object") return { leaves: [] };
  const root = ws as Record<string, unknown>;
  const active = typeof root.active === "string" ? root.active : undefined;
  const leaves: { id?: string; file?: string }[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const c of node) walk(c);
      return;
    }
    const rec = node as Record<string, unknown>;
    const state = rec.state as Record<string, unknown> | undefined;
    const inner = state?.state as Record<string, unknown> | undefined;
    const file = typeof inner?.file === "string" ? (inner.file as string) : undefined;
    if (typeof rec.id === "string" && (state?.type === "markdown" || file)) {
      leaves.push({ id: rec.id as string, ...(file ? { file } : {}) });
    }
    for (const v of Object.values(rec)) walk(v);
  };
  walk(root.main ?? root);
  return { ...(active ? { active } : {}), leaves };
}

type ObsidianJson = { vaults?: Record<string, { path?: string; open?: boolean }> };

export async function resolveObsidianNote(notes: string[] = []): Promise<string | undefined> {
  const dir = obsidianConfigDir();
  if (!dir) {
    notes.push("obsidian:no-config-dir");
    return undefined;
  }
  const cfg = readJson(join(dir, "obsidian.json")) as ObsidianJson | undefined;
  const vaults = Object.values(cfg?.vaults ?? {})
    .map((v) => v?.path)
    .filter((p): p is string => !!p)
    .slice(0, 5);
  if (vaults.length === 0) {
    notes.push("obsidian:no-vaults");
    return undefined;
  }
  for (const vault of vaults) {
    try {
      const rel = activeFileFromWorkspace(readJson(join(vault, ".obsidian", "workspace.json")));
      if (rel) {
        const full = join(vault, rel);
        if (existsSync(full)) {
          notes.push(`obsidian:active:${rel}`);
          return full;
        }
      }
    } catch {
      continue;
    }
  }
  notes.push(`obsidian:vaults=${vaults.length}:miss`);
  return undefined;
}

export async function resolveObsidianOpenNotes(
  notes: string[] = [],
  runningOverride?: boolean,
): Promise<string[]> {
  const running = runningOverride ?? (await isObsidianRunning(notes));
  if (running === false) {
    notes.push("obsidian:open:not-running");
    return [];
  }
  if (running === undefined) notes.push("obsidian:open:running-unknown");
  const dir = obsidianConfigDir();
  if (!dir) {
    notes.push("obsidian:open:no-config-dir");
    return [];
  }
  const cfg = readJson(join(dir, "obsidian.json")) as ObsidianJson | undefined;
  const vaults = Object.values(cfg?.vaults ?? {})
    .map((v) => v?.path)
    .filter((p): p is string => !!p)
    .slice(0, 5);
  if (vaults.length === 0) {
    notes.push("obsidian:open:no-vaults");
    return [];
  }
  const out: string[] = [];
  for (const vault of vaults) {
    try {
      const rels = openNotesFromWorkspace(readJson(join(vault, ".obsidian", "workspace.json")));
      for (const rel of rels) {
        const full = join(vault, rel);
        try {
          if (existsSync(full) && out.length < 10) out.push(full);
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }
  notes.push(`obsidian:open:vaults=${vaults.length}:files=${out.length}`);
  return out;
}

// true = running, false = not running, undefined = check failed (fail open).
async function isObsidianRunning(notes: string[]): Promise<boolean | undefined> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", "IMAGENAME eq Obsidian.exe", "/NH"],
        { timeout: 3000 },
      );
      if (/no tasks/i.test(stdout)) return false;
      return /obsidian\.exe/i.test(stdout) ? true : false;
    }
    const { stdout } = await execFileAsync("pgrep", ["-ix", "obsidian"], { timeout: 3000 });
    return stdout.trim().length > 0;
  } catch (e) {
    // pgrep exits 1 when nothing matches — that MEANS not running.
    if ((e as { code?: unknown })?.code === 1) return false;
    notes.push("obsidian:running-check-failed");
    return undefined;
  }
}
