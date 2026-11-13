// Shared exec-failure notes: timeout vs exit code vs spawn, plus the first
// line of stderr sanitized. `exec-fail` alone proved undebuggable — three
// simultaneous PowerShell failures with no detail hid whether the shell,
// the policy, the clock, or the EDR was guilty.
export function describeExecError(e: unknown): string {
  const err = e as {
    killed?: boolean;
    code?: unknown;
    signal?: unknown;
    message?: unknown;
    stderr?: unknown;
  } | null;
  // Signal matters: a taskkill/EDR kill surfaces as code 1 WITH a signal
  // (SIGTERM) — without it we can't tell murder from a genuine exit(1).
  const sig = typeof err?.signal === "string" && err.signal ? `:sig-${err.signal}` : "";
  const kind = err?.killed
    ? "timeout"
    : typeof err?.code === "number"
      ? `exit-${err.code}${sig}`
      : "spawn";
  // Prefer stderr (the shell's own words); fall back to the message tail
  // (execFile prefixes "Command failed: <full command>" — strip to the end).
  const raw =
    typeof err?.stderr === "string" && err.stderr.trim()
      ? err.stderr
      : tailOf(String(err?.message ?? e));
  const clean = raw
    .replace(/[^a-zA-Z0-9 _.:+()-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${kind}${clean ? `:${clean}` : ""}`;
}

function tailOf(message: string): string {
  // "Command failed: powershell ... <script>" → keep the last 120 chars,
  // which is where PowerShell puts its actual error (FullyQualifiedErrorId).
  const m = /FullyQualifiedErrorId\s*:\s*([A-Za-z0-9_.,-]+)/.exec(message);
  if (m) return m[1]!;
  return message.slice(-120);
}
