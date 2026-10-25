import * as ChildProcess from "node:child_process";
import { promisify } from "node:util";
import type { CapturedWindow } from "@avenire/contracts";
import { resolveDocumentPath } from "./document-path.ts";

const execFile = promisify(ChildProcess.execFile);
const timeout = { timeout: 1_200, windowsHide: true } as const;
const foregroundScript =
  'tell application "System Events" to tell first process whose frontmost is true to return name & linefeed & (name of front window) & linefeed & unix id';

async function command(file: string, args: readonly string[]): Promise<string> {
  const result = await execFile(file, [...args], timeout);
  return result.stdout.trim();
}

export async function collectForeground(): Promise<{
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
      const script =
        '$sig=\'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);\'; if (-not (\'N.W\' -as [type])) { Add-Type -MemberDefinition $sig -Name W -Namespace N }; $h=[N.W]::GetForegroundWindow(); $t=New-Object System.Text.StringBuilder 1024; [void][N.W]::GetWindowText($h,$t,$t.Capacity); [uint32]$capturePid=0; [void][N.W]::GetWindowThreadProcessId($h,[ref]$capturePid); $p=Get-Process -Id $capturePid; Write-Output $p.ProcessName; Write-Output $t.ToString(); Write-Output $capturePid';
      const { execPowerShell } = await import("./research/electron/collectors/ps-queue.ts");
      const { stdout } = await execPowerShell(script, { timeout: 8000, notes });
      [appName = "", title = "", pidText = ""] = stdout.trim().split(/\r?\n/);
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
          notes: ["Linux Wayland or unavailable xprop: foreground app name could not be read."],
        };
      }
    }
    const pid = Number(pidText);
    let filePath: string | undefined;
    try {
      filePath = await resolveDocumentPath(
        {
          appName,
          bundleIdOrExe: appName,
          windowTitle: title,
          ...(Number.isSafeInteger(pid) && pid > 0 ? { processId: pid } : {}),
          isPrivateWindow: /incognito|inprivate|private browsing|private window/i.test(title),
        },
        notes,
      );
    } catch {
      notes.push("Document path could not be resolved.");
    }
    return {
      windows:
        title || appName
          ? [{ appName, title, foreground: true, ...(filePath ? { filePath } : {}) }]
          : [],
      notes,
    };
  } catch (error) {
    const note =
      process.platform === "linux"
        ? "Foreground window unavailable (Wayland does not expose a standard global window API)."
        : `Foreground window collector failed: ${error instanceof Error ? error.message : "unknown error"}`;
    return { windows: [], notes: [note] };
  }
}
