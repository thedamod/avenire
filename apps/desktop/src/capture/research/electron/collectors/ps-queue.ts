import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildUtf8Prelude,
  isHostDeath,
  PS_FLAGS,
  psHostManager,
  type PsResult,
} from "./ps-host.ts";

const execFileAsync = promisify(execFile);

// All PowerShell goes through ONE gate. Rationale, learned the hard way:
// parallel powershell.exe spawns — parallel C# Add-Type compiles especially —
// die together with exit-1 and empty stderr, including scripts that cannot
// throw (try/catch-wrapped Get-Process). Whether the killer is burst
// throttling, AV/EDR heuristics, or compile stampedes starving timeouts,
// serial execution removes the entire class. Wall time grows; the toast's
// loading pill covers it. See Failures.md.
let tail: Promise<void> = Promise.resolve();

export async function runPsQueue<T>(task: () => Promise<T>): Promise<T> {
  const prev = tail;
  let release!: () => void;
  tail = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await task();
  } finally {
    release();
  }
}

export type PsOpts = {
  timeout?: number;
  maxBuffer?: number;
  // Capture notes: host-level events (respawn after a kill, fallback to
  // one-shot) are reported here so last-capture.json shows which mode ran.
  notes?: string[];
};

// A command may be a function: it is evaluated when the call reaches the
// FRONT of the queue, so callers that batch (handle-scan-win) can fold in
// work requested while this call was still waiting its turn.
export type PsCommand = string | (() => string);

// Runs on the persistent host (ps-host.ts) on Windows; one-shot spawn off
// win32, when the host is disabled (died twice / failed to start), or when
// AVENIRE_PS_ONESHOT is set. Always serialized through the one gate.
// One-shot path retries on the O10 signature (bare exit-1 + empty stderr): the
// killer is intermittent AND cross-process (a second capture running in the
// Electron app bursts alongside snapshot:once — per-process serialization
// can't stop that), so one retry still dies ~25% of the time. Two retries with
// backoff + jitter ride through burst windows. Any other failure (timeout,
// stderr text, exhausted retries) propagates to the caller's note unchanged.
// A host death surfaces as the same bare exit shape, so the same retry applies
// (the retry respawns the host; a second death flips to one-shot for good).
const RETRY_DELAYS_MS = [500, 1500];

export async function execPowerShell(command: PsCommand, opts: PsOpts = {}): Promise<PsResult> {
  const timeout = opts.timeout ?? 8000;
  const maxBuffer = opts.maxBuffer ?? 1024 * 1024;
  const run = (): Promise<PsResult> =>
    runPsQueue(async () => {
      const script = typeof command === "function" ? command() : command;
      if (psHostManager.usable) {
        try {
          return await psHostManager.run(script, timeout, maxBuffer);
        } catch (e) {
          // This very death just disabled the host: don't burn a retry,
          // run THIS command one-shot right now.
          if (!isHostDeath(e) || psHostManager.usable) throw e;
        } finally {
          psHostManager.drainNotes(opts.notes);
        }
      }
      psHostManager.drainNotes(opts.notes);
      return runOneShot(script, timeout, maxBuffer);
    });
  let lastErr: unknown;
  let bestErr: unknown; // on exhaustion, throw the most informative failure:
  // an attempt carrying stderr text beats a bare exit-1, even if older.
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await run();
    } catch (e) {
      lastErr = e;
      if (hasStderrText(e)) bestErr = e;
      else bestErr ??= e;
      if (!isBareExit1(e) || attempt === RETRY_DELAYS_MS.length) break;
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]! + jitter));
    }
  }
  throw bestErr ?? lastErr;
}

// One-shot only: the process exit code of `-Command` is 1 whenever `$?` is
// false after the LAST statement — and `try { throw } catch {}` leaves `$?`
// false. So a script that handled its own error (Word not running, a COM
// miss, an unreadable process) exited 1 with EMPTY stderr: byte-for-byte the
// "bare exit-1" O10 signature (verified on-box: `try { throw 'x' } catch {}`
// => exit 1, no output). The trailing `exit 0` makes the exit code mean what
// we want (terminating errors still abort before it => exit 1 + stderr).
// Never appended to host scripts: `exit` there would kill the host.
export function buildOneShotCommand(script: string): string {
  return `${buildUtf8Prelude()}\n${script}\nexit 0`;
}

async function runOneShot(script: string, timeout: number, maxBuffer: number): Promise<PsResult> {
  const r = await execFileAsync(
    "powershell",
    [...PS_FLAGS, "-Command", buildOneShotCommand(script)],
    {
      timeout,
      maxBuffer,
      windowsHide: true,
    },
  );
  // A UTF-8 BOM (console codepage switch) must never reach a parser.
  return { stdout: r.stdout.replace(/^\uFEFF/, ""), stderr: r.stderr };
}

// The O10 shape: killed-by-environment, no diagnostic text. Anything with
// stderr content is a real script error — retrying it would just fail twice.
function isBareExit1(e: unknown): boolean {
  const err = e as { killed?: boolean; code?: unknown; stderr?: unknown } | null;
  if (!err || err.killed) return false;
  if (err.code !== 1) return false;
  return !hasStderrText(e);
}

function hasStderrText(e: unknown): boolean {
  const err = e as { stderr?: unknown } | null;
  return typeof err?.stderr === "string" && err.stderr.trim() !== "";
}
