import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describeExecError } from "./exec-note.ts";

const execFileAsync = promisify(execFile);

// Per-snapshot shared context. Collectors run in parallel and several need
// the same expensive facts (process table, window list); memo() lets the
// first caller start the work and everyone else await the same promise
// instead of each spawning their own tasklist/ps/FS walk. One context lives
// for ONE snapshot only — never cache across snapshots (state goes stale).
export type CaptureContext = {
  notes: string[];
  partialWindows?: import("../support/types.ts").BackgroundWindow[];
  deadline: number;
  // Memoize an async computation for the lifetime of ONE snapshot, so
  // collectors running in parallel share one spawn/FS read instead of
  // repeating it. Same key → same promise (also while in flight).
  memo<T>(key: string, fn: () => Promise<T>): Promise<T>;
};

export function createCaptureContext(notes: string[] = [], budgetMs = Infinity): CaptureContext {
  const cache = new Map<string, Promise<unknown>>();
  const deadline = Date.now() + budgetMs;
  return {
    notes,
    deadline,
    memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
      if (Date.now() >= deadline)
        return Promise.reject(new Error("Native capture deadline exceeded"));
      const hit = cache.get(key);
      if (hit) return hit as Promise<T>;
      // Wrapped so a synchronous throw in fn is a rejected promise too, and
      // the rejection is cached (a failing spawn is not retried per collector).
      const p = (async () => fn())();
      cache.set(key, p);
      return p;
    },
  };
}

export type ProcEntry = { pid: number; name: string }; // name: exe/comm without .exe

// Pure: tasklist.exe CSV rows ("vlc.exe","1234","Console","1","45,000 K")
// → image name AS PRINTED (extension kept) + pid. First two fields only.
export function parseTasklistRaw(stdout: string): { pid: number; image: string }[] {
  const out: { pid: number; image: string }[] = [];
  for (const line of stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^"([^"]+)"\s*,\s*"(\d+)"/.exec(line);
    if (!m) continue;
    const pid = Number(m[2]!);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    out.push({ pid, image: m[1]! });
  }
  return out;
}

// Pure: every process in a tasklist CSV, .exe stripped. No filtering/cap.
export function parseTasklistCsv(stdout: string): ProcEntry[] {
  return parseTasklistRaw(stdout).map(({ pid, image }) => ({
    pid,
    name: image.replace(/\.exe$/i, ""),
  }));
}

// Pure: `ps -axo pid=,comm=` lines ("  42 /Applications/Foo.app/Contents/MacOS/Foo")
// → basename of comm (comm may contain spaces, so split on the FIRST gap only).
export function parsePsOutput(stdout: string): ProcEntry[] {
  const out: ProcEntry[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]!);
    const name = m[2]!.split("/").pop() ?? m[2]!;
    if (pid > 0 && name) out.push({ pid, name });
  }
  return out;
}

// Cross-platform process list, memoized under 'procs'. win32 uses
// tasklist.exe via execFile, NOT powershell — parallel PowerShell dies
// together on the dev box (Failures.md O10). Never throws: [] + note.
export function listProcesses(ctx: CaptureContext): Promise<ProcEntry[]> {
  return ctx.memo("procs", async () => {
    try {
      if (process.platform === "win32") {
        const { stdout } = await execFileAsync("tasklist", ["/FO", "CSV", "/NH"], {
          timeout: collectorTimeout(ctx, 8000),
          maxBuffer: 4 * 1024 * 1024,
        });
        return parseTasklistCsv(stdout);
      }
      if (process.platform === "linux") {
        const pids = (await readdir("/proc")).filter((d) => /^\d+$/.test(d));
        // Per-pid read: processes exit mid-walk, so each failure is just skipped.
        const entries = await Promise.all(
          pids.map(async (d): Promise<ProcEntry | undefined> => {
            try {
              const name = (await readFile(`/proc/${d}/comm`, "utf8")).trim();
              return name ? { pid: Number(d), name } : undefined;
            } catch {
              return undefined;
            }
          }),
        );
        return entries.filter((e): e is ProcEntry => !!e);
      }
      if (process.platform === "darwin") {
        const { stdout } = await execFileAsync("ps", ["-axo", "pid=,comm="], {
          timeout: collectorTimeout(ctx, 8000),
          maxBuffer: 4 * 1024 * 1024,
        });
        return parsePsOutput(stdout);
      }
      ctx.notes.push(`${process.platform}:procs:unsupported`);
    } catch (e) {
      ctx.notes.push(`${process.platform}:procs:fail:${describeExecError(e)}`);
    }
    return [];
  });
}

// Native modules are deliberately not required by the desktop shell. Each platform
// collector supplies its own OS enumeration, sharing this memo per capture.
export type OpenWindow = { pid: number; appName: string; title: string };
export function listOpenWindows(_ctx: CaptureContext): Promise<OpenWindow[] | undefined> {
  return _ctx.memo("windows", async () => undefined);
}

export function collectorTimeout(ctx: CaptureContext, timeoutMs: number): number {
  const remaining = ctx.deadline - Date.now();
  if (remaining <= 0) throw new Error("Native capture deadline exceeded");
  return Math.min(timeoutMs, remaining);
}
