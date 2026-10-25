import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { powerShellOneShot } from "../../../../config.ts";

// Persistent PowerShell host: ONE long-lived powershell.exe that reads one
// request per stdin line and answers with one framed stdout line. Why: every
// one-shot spawn costs 0.3-0.7s of startup AND recompiles inline C# (Add-Type,
// 1-2s) from scratch; a warm host pays both once per app run. The single-gate
// principle of ps-queue.ts is unchanged — the queue still serializes, this
// module only replaces WHAT runs a queued command. See Failures.md O10.
//
// Wire format (all ASCII, so no console codepage can ever corrupt it):
//   request  (stdin):  <nonce> <base64 utf8 script>\n
//   response (stdout): ::PSH:: <nonce> <ok 0|1> <base64 stdout> <base64 stderr>\n
// Base64 also means a script that prints the marker text can't forge a frame.
// Text on stdout outside a frame (stray Write-Host) is ignored.

export type PsResult = { stdout: string; stderr: string };

export const PS_FLAGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];
export const FRAME_MARK = "::PSH:: ";

// Prepended to every one-shot command and run once by the host: non-ASCII
// paths (accents, CJK, OneDrive folder names) otherwise come out in the OEM
// codepage and fail existsSync. try/catch: SetConsoleOutputCP throws when the
// process has no console. New-Object (not ::new) keeps this PS-3-safe.
export function buildUtf8Prelude(): string {
  return "$__e = New-Object System.Text.UTF8Encoding $false; try { [Console]::OutputEncoding = $__e } catch {}; $OutputEncoding = $__e;";
}

// The host loop. Rules for this text: no double quotes (it travels as a
// -Command argv element), no backticks (F7), `$__` names so request scripts
// that read an unset variable can't see ours. Scripts run as a ScriptBlock in
// a child scope: their variables/functions die with the request, but Add-Type
// types live for the session (hence the guards in every script that compiles).
// Output objects are stringified one per line; error records go to stderr
// separately. A terminating error => ok=0 + message as stderr.
export function buildHostLoop(): string {
  return [
    buildUtf8Prelude(),
    "while ($true) {",
    "  $__l = [Console]::In.ReadLine();",
    "  if ($null -eq $__l) { break }",
    "  $__i = $__l.IndexOf(' ');",
    "  if ($__i -lt 1) { continue }",
    "  $__n = $__l.Substring(0, $__i); $__ok = 1;",
    "  $__so = New-Object System.Collections.Generic.List[string];",
    "  $__se = New-Object System.Collections.Generic.List[string];",
    "  try {",
    "    $__src = $__e.GetString([Convert]::FromBase64String($__l.Substring($__i + 1).Trim()));",
    "    $__sb = [ScriptBlock]::Create($__src);",
    "    & $__sb 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $__se.Add([string]$_) } else { $__so.Add([string]$_) } };",
    "  } catch { $__ok = 0; $__se.Add([string]$_.Exception.Message) }",
    "  $__nl = [string][char]10;",
    "  $__f = '::PSH:: ' + $__n + ' ' + $__ok + ' ' + [Convert]::ToBase64String($__e.GetBytes([string]::Join($__nl, $__so))) + ' ' + [Convert]::ToBase64String($__e.GetBytes([string]::Join($__nl, $__se)));",
    "  [Console]::Out.Write($__f + $__nl); [Console]::Out.Flush();",
    "}",
  ].join("\n");
}

export function encodeRequest(nonce: string, script: string): string {
  return `${nonce} ${Buffer.from(script, "utf8").toString("base64")}\n`;
}

export type HostFrame = { nonce: string; ok: boolean; stdout: string; stderr: string };

// Incremental stdout parser: feed arbitrary chunks (split anywhere, even
// mid-marker or mid-base64), get completed frames out. Pure and unit-tested.
export class FrameParser {
  private buf = "";
  static readonly MAX_BUF = 64 * 1024 * 1024;

  push(chunk: string): HostFrame[] {
    this.buf += chunk;
    const frames: HostFrame[] = [];
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, "");
      this.buf = this.buf.slice(nl + 1);
      const f = parseFrameLine(line);
      if (f) frames.push(f);
    }
    // A runaway unterminated line is garbage, not a frame: drop, don't OOM.
    if (this.buf.length > FrameParser.MAX_BUF) this.buf = "";
    return frames;
  }
}

export function parseFrameLine(line: string): HostFrame | undefined {
  const at = line.indexOf(FRAME_MARK);
  if (at < 0) return undefined;
  // Empty base64 fields stay empty strings (split keeps them), so exactly 4 parts.
  const parts = line.slice(at + FRAME_MARK.length).split(" ");
  if (parts.length !== 4 || !parts[0] || (parts[1] !== "0" && parts[1] !== "1")) return undefined;
  const dec = (b64: string): string => Buffer.from(b64, "base64").toString("utf8");
  return { nonce: parts[0], ok: parts[1] === "1", stdout: dec(parts[2]!), stderr: dec(parts[3]!) };
}

// Error shapes mirror execFile's so describeExecError / the O10 retry logic
// need no special cases: timeout => killed:true; script error => code 1 +
// stderr text; host death => code (exit code or 1), hostDied marker.
export type PsError = Error & {
  killed?: boolean;
  code?: unknown;
  signal?: unknown;
  stderr?: string;
  stdout?: string;
  hostDied?: boolean;
};

function psError(message: string, extra: Partial<PsError>): PsError {
  return Object.assign(new Error(message), { stderr: "", stdout: "", ...extra });
}

export function isHostDeath(e: unknown): boolean {
  return !!(e as PsError | null)?.hostDied;
}

export type SpawnFn = (command: string, args: string[]) => ChildProcess;

export type PsHostOptions = {
  command?: string;
  args?: string[];
  spawnFn?: SpawnFn;
  // Called when the process ends WITHOUT us having killed it (crash, EDR kill,
  // failed spawn). `spawnFailed`: it never ran at all.
  onUnexpectedExit?: (info: {
    spawnFailed: boolean;
    code: number | null;
    signal: string | null;
  }) => void;
};

type Pending = {
  nonce: string;
  maxBuffer: number;
  resolve: (r: PsResult) => void;
  reject: (e: PsError) => void;
  timer: NodeJS.Timeout;
};

// One process-exit hook for every host ever spawned (a hook per respawn would
// trip MaxListeners); killing at exit keeps no stray powershell.exe behind.
const liveHosts = new Set<{ kill(): void }>();
let exitHooked = false;

const defaultSpawn: SpawnFn = (command, args) =>
  spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

export class PsHost {
  private child: ChildProcess | undefined;
  private parser = new FrameParser();
  private pending: Pending | undefined;
  private stderrTail = "";
  private seq = 0;
  private readonly opts: PsHostOptions;

  constructor(opts: PsHostOptions = {}) {
    this.opts = opts;
  }

  get alive(): boolean {
    return !!this.child;
  }

  // One request at a time — ps-queue guarantees it; a second concurrent call
  // is a programming error, not something to silently interleave.
  run(script: string, timeoutMs: number, maxBuffer: number): Promise<PsResult> {
    if (this.pending) return Promise.reject(psError("ps-host busy", { code: "EBUSY" }));
    let child: ChildProcess;
    try {
      child = this.ensure();
    } catch (e) {
      return Promise.reject(
        psError(String((e as Error)?.message ?? e), { code: "ENOENT", hostDied: true }),
      );
    }
    const nonce = `${randomBytes(6).toString("hex")}${++this.seq}`;
    return new Promise<PsResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        // A hung NtQuery/COM call can't be cancelled from inside — the only
        // cure is killing the process. Next call respawns lazily.
        this.pending = undefined;
        this.kill();
        reject(psError(`ps-host ${timeoutMs}ms`, { killed: true, signal: "SIGTERM", code: null }));
      }, timeoutMs);
      this.pending = { nonce, maxBuffer, resolve, reject, timer };
      try {
        child.stdin?.write(encodeRequest(nonce, script));
      } catch (e) {
        this.failPending(
          psError(String((e as Error)?.message ?? e), { code: "EPIPE", hostDied: true }),
        );
      }
    });
  }

  // Intentional kill (timeout / shutdown): not reported as an unexpected exit.
  kill(): void {
    const c = this.child;
    this.child = undefined;
    this.parser = new FrameParser();
    liveHosts.delete(this);
    if (!c) return;
    c.removeAllListeners("exit");
    c.removeAllListeners("error");
    c.on("error", () => {});
    try {
      c.stdin?.destroy();
      c.kill();
    } catch {
      // already gone
    }
  }

  private ensure(): ChildProcess {
    if (this.child) return this.child;
    const command = this.opts.command ?? "powershell";
    const args = this.opts.args ?? [...PS_FLAGS, "-Command", buildHostLoop()];
    const child = (this.opts.spawnFn ?? defaultSpawn)(command, args);
    this.child = child;
    this.parser = new FrameParser();
    this.stderrTail = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => this.onStdout(d));
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (d: string) => {
      this.stderrTail = (this.stderrTail + d).slice(-2000);
    });
    child.stdin?.on("error", () => {}); // EPIPE after death surfaces via 'exit'
    child.on("error", (err) => this.onDeath(child, true, null, null, err));
    child.on("exit", (code, signal) => this.onDeath(child, false, code, signal));
    // Don't hold the event loop open (snapshot:once) — pending requests keep
    // it alive through their timeout timers. stdin EOF ends the loop cleanly.
    child.unref?.();
    (child.stdout as unknown as { unref?: () => void } | null)?.unref?.();
    (child.stderr as unknown as { unref?: () => void } | null)?.unref?.();
    (child.stdin as unknown as { unref?: () => void } | null)?.unref?.();
    liveHosts.add(this);
    if (!exitHooked) {
      exitHooked = true;
      process.once("exit", () => liveHosts.forEach((h) => h.kill()));
    }
    return child;
  }

  private onStdout(chunk: string): void {
    for (const f of this.parser.push(chunk)) {
      const p = this.pending;
      if (!p || f.nonce !== p.nonce) continue; // stale / foreign frame
      this.pending = undefined;
      clearTimeout(p.timer);
      if (f.stdout.length > p.maxBuffer) {
        p.reject(
          psError("stdout maxBuffer length exceeded", {
            code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
            stderr: f.stderr,
          }),
        );
      } else if (f.ok) {
        p.resolve({ stdout: f.stdout, stderr: f.stderr });
      } else {
        p.reject(
          psError(f.stderr || "script failed", { code: 1, stdout: f.stdout, stderr: f.stderr }),
        );
      }
    }
  }

  private onDeath(
    child: ChildProcess,
    spawnFailed: boolean,
    code: number | null,
    signal: string | null,
    err?: Error,
  ): void {
    if (this.child !== child) return; // already handled ('error' then 'exit') or killed on purpose
    this.child = undefined;
    liveHosts.delete(this);
    const tail = this.stderrTail;
    this.failPending(
      psError(err?.message ?? `ps-host exited code=${code} signal=${signal}`, {
        code: spawnFailed
          ? ((err as NodeJS.ErrnoException | undefined)?.code ?? "ENOENT")
          : (code ?? 1),
        signal: signal ?? undefined,
        stderr: tail,
        hostDied: true,
      }),
    );
    this.opts.onUnexpectedExit?.({ spawnFailed, code, signal });
  }

  private failPending(e: PsError): void {
    const p = this.pending;
    if (!p) return;
    this.pending = undefined;
    clearTimeout(p.timer);
    p.reject(e);
  }
}

// ---- supervision: when does the host give up? --------------------------------

// Two unexpected deaths inside the window => stop trusting the host for the
// rest of the process lifetime (EDR killing it, broken install). A failed
// spawn counts immediately: there is nothing to retry.
export class DeathTracker {
  private stamps: number[] = [];
  private readonly windowMs: number;
  private readonly limit: number;
  constructor(windowMs = 60_000, limit = 2) {
    this.windowMs = windowMs;
    this.limit = limit;
  }

  // Returns true when the host should be abandoned.
  record(now: number, spawnFailed = false): boolean {
    if (spawnFailed) return true;
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    this.stamps.push(now);
    return this.stamps.length >= this.limit;
  }
}

export type HostLike = Pick<PsHost, "run" | "kill">;

export class PsHostManager {
  private host: HostLike | undefined;
  private disabled = false;
  private readonly deaths = new DeathTracker();
  private pendingNotes: string[] = [];
  private noted = new WeakSet<string[]>();

  private readonly make: (
    onUnexpectedExit: NonNullable<PsHostOptions["onUnexpectedExit"]>,
  ) => HostLike;
  private readonly enabled: () => boolean;
  private readonly now: () => number;

  constructor(
    make: (onUnexpectedExit: NonNullable<PsHostOptions["onUnexpectedExit"]>) => HostLike,
    enabled: () => boolean = () => process.platform === "win32" && !powerShellOneShot,
    now: () => number = Date.now,
  ) {
    this.make = make;
    this.enabled = enabled;
    this.now = now;
  }

  get usable(): boolean {
    return !this.disabled && this.enabled();
  }

  run(script: string, timeoutMs: number, maxBuffer: number): Promise<PsResult> {
    this.host ??= this.make((info) => this.onExit(info));
    return this.host.run(script, timeoutMs, maxBuffer).catch((e) => {
      if ((e as PsError)?.killed) this.pendingNotes.push("win:pshost:timeout-killed");
      throw e;
    });
  }

  // Surface host-level events in the CALLER's capture notes: pending events
  // once, and a standing fallback marker once per notes array.
  drainNotes(into?: string[]): void {
    if (!into) return;
    for (const n of this.pendingNotes.splice(0)) into.push(n);
    if (this.disabled && !this.noted.has(into)) {
      this.noted.add(into);
      into.push("win:pshost:mode=oneshot");
    }
  }

  private onExit(info: { spawnFailed: boolean; code: number | null; signal: string | null }): void {
    this.host = undefined;
    this.pendingNotes.push(
      `win:pshost:died:${info.spawnFailed ? "spawn" : `exit-${info.code ?? "null"}${info.signal ? `:sig-${info.signal}` : ""}`}`,
    );
    if (this.deaths.record(this.now(), info.spawnFailed)) {
      this.disabled = true;
      this.pendingNotes.push("win:pshost:fallback:oneshot");
    }
  }
}

// Process-wide singleton used by ps-queue.ts.
export const psHostManager = new PsHostManager(
  (onUnexpectedExit) => new PsHost({ onUnexpectedExit }),
);
