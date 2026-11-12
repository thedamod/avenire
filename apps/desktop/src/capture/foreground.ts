import { nativeFile } from "./native-file.ts";
import * as ChildProcess from "node:child_process";
import { promisify } from "node:util";
import type { CapturedWindow } from "@avenire/contracts";
import type { ForegroundApp } from "./support/types.ts";
import { WINDOWS_FOREGROUND_SCRIPT } from "./foreground-windows.ts";
import {
  createCaptureContext,
  type CaptureContext,
} from "./collectors/capture-context.ts";
import { resolveDocumentPath } from "./document-path.ts";

const execFile = promisify(ChildProcess.execFile);
const timeout = { timeout: 1_200, windowsHide: true } as const;
const foregroundScript =
  'tell application "System Events" to tell first process whose frontmost is true to return name & linefeed & (name of front window) & linefeed & unix id';

async function command(file: string, args: readonly string[]): Promise<string> {
  const result = await execFile(file, [...args], timeout);
  return result.stdout.trim();
}

export async function readForeground(): Promise<{
  readonly app?: ForegroundApp;
  readonly windows: readonly CapturedWindow[];
  readonly notes: readonly string[];
}> {
  try {
    let appName = "";
    let title = "";
    let pidText = "";
    const notes: string[] = [];
    if (process.platform === "darwin") {
      const result = await command("osascript", ["-e", foregroundScript]);
      [appName = "", title = "", pidText = ""] = result.split(/\r?\n/);
    } else if (process.platform === "win32") {
      const { execPowerShell } = await import("./collectors/ps-queue.ts");
      const { stdout } = await execPowerShell(WINDOWS_FOREGROUND_SCRIPT, { timeout: 1200, notes });
      [appName = "", title = "", pidText = ""] = stdout.trim().split(/\r?\n/);
    } else if ((await import("../config.ts")).isWayland) {
      const value: unknown = JSON.parse(await command("hyprctl", ["activewindow", "-j"]));
      if (!value || typeof value !== "object") throw new Error("Invalid Hyprland response");
      const window = value as Record<string, unknown>;
      appName = typeof window.class === "string" ? window.class : "";
      title = typeof window.title === "string" ? window.title : "";
      pidText = typeof window.pid === "number" ? String(window.pid) : "";
    } else {
      title = await command("xdotool", ["getactivewindow", "getwindowname"]);
      try {
        const id = await command("xdotool", ["getactivewindow"]);
        pidText = await command("xdotool", ["getwindowpid", id]);
        const klass = await command("xprop", ["-id", id, "WM_CLASS"]);
        appName = klass.split("=")[1]?.replace(/["']/g, "").split(",")[0]?.trim() ?? "";
      } catch {
        return {
          windows: title ? [{ appName: "", title, foreground: true }] : [],
          notes: ["Linux xprop unavailable: foreground app name could not be read."],
        };
      }
    }
    const pid = Number(pidText);
    const app: ForegroundApp = {
      appName,
      bundleIdOrExe: appName,
      windowTitle: title,
      ...(Number.isSafeInteger(pid) && pid > 0 ? { processId: pid } : {}),
      isPrivateWindow: /incognito|inprivate|private browsing|private window/i.test(title),
    };
    return {
      app,
      windows: title || appName ? [{ appName, title, foreground: true }] : [],
      notes,
    };
  } catch (error) {
    const note =
      process.platform === "linux"
        ? "Foreground window unavailable (Wayland requires a supported compositor such as Hyprland)."
        : `Foreground window collector failed: ${error instanceof Error ? error.message : "unknown error"}`;
    return { windows: [], notes: [note] };
  }
}

export async function resolveForeground(
  observation: Awaited<ReturnType<typeof readForeground>>,
  ctx?: CaptureContext,
) {
  if (!observation.app || observation.app.isPrivateWindow) return { ...observation, windows: [] };
  const notes = [...observation.notes];
  const { bounded } = await import("./timing.ts");
  try {
    const filePath = await bounded(
      resolveDocumentPath(observation.app, notes, ctx ?? createCaptureContext(notes)),
      process.platform === "win32" ? 4000 : 3000,
    );
    return {
      ...observation,
      windows: observation.windows.flatMap((window) => {
        const path = nativeFile(window.appName, filePath);
        return path ? [{ ...window, filePath: path }] : [];
      }),
      notes,
    };
  } catch {
    return {
      ...observation,
      windows: [],
      notes: [...notes, "Document resolution timed out; capture again to retry."],
    };
  }
}
export async function collectForeground() {
  return resolveForeground(await readForeground());
}
let cached: Awaited<ReturnType<typeof readForeground>> = { windows: [], notes: [] };
let polling = false;
export function cachedForeground() {
  return cached;
}
export function startForegroundPoll(enabled: () => boolean): () => void {
  const poll = async () => {
    if (!enabled()) {
      cached = { windows: [], notes: [] };
      return;
    }
    if (polling) return;
    polling = true;
    try {
      cached = await readForeground();
    } finally {
      polling = false;
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), 2000);
  timer.unref();
  return () => clearInterval(timer);
}
