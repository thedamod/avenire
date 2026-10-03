import * as ChildProcess from "node:child_process";
import { promisify } from "node:util";
import type { CapturedWindow } from "@avenire/contracts";

const execFile = promisify(ChildProcess.execFile);
const timeout = { timeout: 1_200, windowsHide: true } as const;

async function command(file: string, args: readonly string[]): Promise<string> {
  const result = await execFile(file, [...args], timeout);
  return result.stdout.trim();
}

export async function collectForeground(): Promise<{ readonly windows: readonly CapturedWindow[]; readonly notes: readonly string[] }> {
  try {
    let appName = "";
    let title = "";
    if (process.platform === "darwin") {
      const result = await command("osascript", ["-e", 'tell application "System Events" to tell first process whose frontmost is true to return name & linefeed & (name of front window)']);
      [appName = "", title = ""] = result.split("\n");
    } else if (process.platform === "win32") {
      const script = "$sig='[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);'; Add-Type -MemberDefinition $sig -Name W -Namespace N; $h=[N.W]::GetForegroundWindow(); $t=New-Object System.Text.StringBuilder 1024; [void][N.W]::GetWindowText($h,$t,$t.Capacity); $p=Get-Process | Where-Object {$_.MainWindowHandle -eq $h} | Select-Object -First 1; Write-Output $p.ProcessName; Write-Output $t.ToString()";
      const result = await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
      [appName = "", title = ""] = result.split("\n");
    } else {
      title = await command("xdotool", ["getactivewindow", "getwindowname"]);
      try {
        const id = await command("xdotool", ["getactivewindow"]);
        const klass = await command("xprop", ["-id", id, "WM_CLASS"]);
        appName = klass.split("=")[1]?.replace(/[\"']/g, "").split(",")[0]?.trim() ?? "";
      } catch {
        return { windows: title ? [{ appName: "", title, foreground: true }] : [], notes: ["Linux Wayland or unavailable xprop: foreground app name could not be read."] };
      }
    }
    return { windows: title || appName ? [{ appName, title, foreground: true }] : [], notes: [] };
  } catch (error) {
    const note = process.platform === "linux" ? "Foreground window unavailable (Wayland does not expose a standard global window API)." : `Foreground window collector failed: ${error instanceof Error ? error.message : "unknown error"}`;
    return { windows: [], notes: [note] };
  }
}
