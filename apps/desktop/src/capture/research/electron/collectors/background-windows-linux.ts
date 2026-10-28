import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isBrowserApp, isMediaApp } from "../../src/capture/app-catalog.ts";
import { isAutoCapturableFile } from "../../src/capture/scannable-files.ts";
import type { BackgroundWindow } from "../../src/capture/types.ts";
import {
  collectorTimeout,
  createCaptureContext,
  listOpenWindows,
  listProcesses,
  type CaptureContext,
} from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";

const execFileAsync = promisify(execFile);

const MAX_WINDOWS = 20;

// Exported for tests: `wmctrl -l -p` rows → {pid, title}. Row shape:
//   0x04a00003  0 1234  host  Window title here
export function parseWmctrl(stdout: string): { pid: number; title: string }[] {
  const out: { pid: number; title: string }[] = [];
  for (const line of stdout
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = /^0x[0-9a-f]+\s+\S+\s+(\d+)\s+\S+\s+(.*)$/i.exec(line);
    if (!m) continue;
    const pid = Number(m[1]!);
    const title = m[2]!.trim();
    if (pid > 0 && title) out.push({ pid, title });
  }
  return out;
}

// Linux: visible windows via get-windows (native, shared per snapshot) with
// wmctrl (X11; usually absent on Wayland → []) as the fallback. Background
// windows get the same /proc fd scans as foreground (gated to target apps);
// media players are owned by background-media.
export async function getBackgroundWindowsLinux(
  fgPid: number | undefined,
  notes: string[] = [],
  ctx: CaptureContext = createCaptureContext(notes),
): Promise<BackgroundWindow[]> {
  const out: { item: BackgroundWindow; pid: number }[] = [];
  const add = (appName: string, title: string, pid: number) => {
    if (!appName || !title || pid === fgPid || isBrowserApp(appName)) return;
    if (out.length < MAX_WINDOWS) out.push({ item: { appName, windowTitle: title }, pid });
  };
  const native = await listOpenWindows(ctx);
  if (native) {
    for (const w of native) add(w.appName, w.title.trim(), w.pid);
    notes.push(`linux:bgwin:native=${native.length}`);
  } else {
    try {
      const { stdout } = await execFileAsync("wmctrl", ["-l", "-p"], {
        timeout: collectorTimeout(ctx, 2000),
      });
      // Names from the shared process table (comm), not a per-window /proc read.
      const names = new Map((await listProcesses(ctx)).map((p) => [p.pid, p.name]));
      for (const w of parseWmctrl(stdout)) add(names.get(w.pid) ?? "", w.title, w.pid);
    } catch (e) {
      notes.push(`linux:bgwin:no-wmctrl:${describeExecError(e)}`);
      try {
        const { stdout } = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"], {
          timeout: collectorTimeout(ctx, 1500),
        });
        const ids = (stdout.match(/0x[0-9a-f]+/gi) ?? []).slice(0, MAX_WINDOWS);
        const names = new Map((await listProcesses(ctx)).map((p) => [p.pid, p.name]));
        await Promise.all(
          ids.map(async (id) => {
            try {
              const { stdout: row } = await execFileAsync(
                "xprop",
                ["-id", id, "_NET_WM_PID", "_NET_WM_NAME", "WM_NAME"],
                { timeout: collectorTimeout(ctx, 1500) },
              );
              const parsed = parseXpropWindow(row);
              if (parsed) add(names.get(parsed.pid) ?? "", parsed.title, parsed.pid);
            } catch {
              /* Closed/restricted window. */
            }
          }),
        );
      } catch (error) {
        notes.push(`linux:bgwin:ewmh-unavailable:${describeExecError(error)}`);
        return [];
      }
    }
  }
  const { isLocalFileApp } = await import("../../src/capture/app-catalog.ts");
  const routeForApp = (app: { appName: string; [key: string]: unknown }) =>
    isLocalFileApp(app.appName);
  const { resolveDocumentPathLinux } = await import("./document-path-linux.ts");
  // One scan per DISTINCT pid (memoized in resolveDocumentPathLinux), so
  // several windows of one app don't burn the cap on the same answer.
  const scanned = new Set<number>();
  const jobs = out.filter(({ item: w, pid }) => {
    if (isMediaApp(w.appName)) return false;
    const target = !!routeForApp({
      bundleIdOrExe: w.appName,
      appName: w.appName,
      windowTitle: w.windowTitle,
      processId: pid,
      isPrivateWindow: false,
    });
    if (!target) return false;
    if (!scanned.has(pid)) {
      if (scanned.size >= 5) return false;
      scanned.add(pid);
    }
    return true;
  });
  await Promise.all(
    jobs.map(async ({ item: w, pid }) => {
      try {
        const hit = await resolveDocumentPathLinux(
          {
            bundleIdOrExe: w.appName,
            appName: w.appName,
            windowTitle: w.windowTitle,
            processId: pid,
            isPrivateWindow: false,
          },
          notes,
          ctx,
        );
        if (hit && isAutoCapturableFile(w.appName, hit)) w.filePath = hit;
      } catch {
        // per-window failure degrades silently
      }
    }),
  );
  return out.map((o) => o.item);
}

export function parseXpropWindow(stdout: string): { pid: number; title: string } | undefined {
  const pid = Number(/_NET_WM_PID[^=]*=\s*(\d+)/.exec(stdout)?.[1]);
  const title = /(?:_NET_WM_NAME|WM_NAME)[^=]*=\s*"(.*)"/.exec(stdout)?.[1];
  return pid > 0 && title ? { pid, title } : undefined;
}
