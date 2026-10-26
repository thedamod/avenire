import { pickBestPath, rankCandidatePaths } from "../../src/capture/path-ranking.ts";
import { SCANNABLE_EXTENSIONS } from "../../src/capture/scannable-files.ts";
import type { CaptureContext } from "./capture-context.ts";
import { describeExecError } from "./exec-note.ts";
import { execPowerShell } from "./ps-queue.ts";

// Open-file-handle scan of a SET of pids in ONE system handle-table walk
// (NtQuerySystemInformation class 64). Inline C# compiled by Add-Type inside
// the persistent PowerShell host (ps-host.ts), so the 1-2s compile is paid once.
//
// Why class 64 (SystemExtendedHandleInformation) and not 16: class 16 packs
// pid and handle value into 16 bits each, so any pid > 65535 (routine on
// long-uptime Win10/11) silently never matched. Extended entries carry
// ULONG_PTR for both. Layout (x64, 40 bytes/entry; header 16 bytes):
//   header: NumberOfHandles ULONG_PTR, Reserved ULONG_PTR
//   entry : Object PVOID @0, UniqueProcessId ULONG_PTR @8, HandleValue
//           ULONG_PTR @16, GrantedAccess ULONG @24, CreatorBackTraceIndex
//           USHORT @28, ObjectTypeIndex USHORT @30, HandleAttributes ULONG
//           @32, Reserved ULONG @36
// Offsets below are computed from IntPtr.Size, so x86 PowerShell stays right.
//
// C# 5 only (Windows PowerShell's Add-Type uses the CodeDom csc): no ?.,
// string interpolation, out var, expression bodies. String.raw so C# string
// literals keep their backslashes; no backticks and no dollar-brace in it.
const HANDLE_SCAN_CS = String.raw`using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class HandleScan {
    private const int SystemExtendedHandleInformation = 64;
    private const int ObjectTypeInformation = 2;
    private const uint STATUS_SUCCESS = 0;
    private const uint STATUS_INFO_LENGTH_MISMATCH = 0xC0000004;
    private const uint PROCESS_DUP_HANDLE = 0x40;
    private const uint DUPLICATE_SAME_ACCESS = 0x2;
    private const uint FILE_TYPE_DISK = 1;
    private const long MAX_TABLE_BYTES = 512L * 1024 * 1024;
    private static readonly int P = IntPtr.Size;
    private static readonly int HEADER = 2 * IntPtr.Size;
    private static readonly int ENTRY = 3 * IntPtr.Size + 16;
    private static readonly int OFF_PID = IntPtr.Size;
    private static readonly int OFF_HANDLE = 2 * IntPtr.Size;
    private static readonly int OFF_TYPE = 3 * IntPtr.Size + 6;
    // ObjectTypeIndex of "File" and a per-index verdict, learned once per
    // session: after the first hit every other type index is skipped without
    // any NtQueryObject call (the dominant cost of the old scan).
    private static int FileTypeIndex = -1;
    private static sbyte[] TypeVerdict = new sbyte[4096];
    private class PidState {
        public IntPtr Proc;
        public bool Open;
        public int Handles;
        public List<string> Paths = new List<string>();
        public HashSet<string> Seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct UNICODE_STRING {
        public ushort Length;
        public ushort MaximumLength;
        public IntPtr Buffer;
    }
    [DllImport("ntdll.dll")]
    private static extern uint NtQuerySystemInformation(int c, IntPtr buf, int len, out int retLen);
    [DllImport("ntdll.dll")]
    private static extern uint NtQueryObject(IntPtr h, int c, IntPtr buf, int len, out int retLen);
    [DllImport("kernel32.dll")]
    private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")]
    private static extern bool DuplicateHandle(IntPtr srcProc, IntPtr srcHandle, IntPtr curProc, out IntPtr tgt, uint access, bool inherit, uint opts);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")]
    private static extern uint GetFileType(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern uint GetFinalPathNameByHandle(IntPtr h, StringBuilder path, uint cch, uint flags);
    private static string QueryType(IntPtr h) {
        int len = 1024;
        IntPtr buf = Marshal.AllocHGlobal(len);
        try {
            int ret;
            uint st = NtQueryObject(h, ObjectTypeInformation, buf, len, out ret);
            if (st != STATUS_SUCCESS) return null;
            UNICODE_STRING us = (UNICODE_STRING)Marshal.PtrToStructure(buf, typeof(UNICODE_STRING));
            if (us.Length == 0 || us.Buffer == IntPtr.Zero) return null;
            return Marshal.PtrToStringUni(us.Buffer, us.Length / 2);
        } catch { return null; }
        finally { Marshal.FreeHGlobal(buf); }
    }
    // \\?\C:\x -> C:\x ; \\?\UNC\srv\share\x -> \\srv\share\x
    private static string Clean(string p) {
        if (p.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + p.Substring(8);
        if (p.StartsWith(@"\\?\", StringComparison.Ordinal)) return p.Substring(4);
        return p;
    }
    private static bool IsFileHandle(ushort typeIndex, IntPtr dup) {
        if (FileTypeIndex >= 0) return typeIndex == FileTypeIndex;
        int slot = typeIndex & 4095;
        if (TypeVerdict[slot] != 0) return TypeVerdict[slot] > 0;
        bool isFile = string.Equals(QueryType(dup), "File", StringComparison.Ordinal);
        TypeVerdict[slot] = (sbyte)(isFile ? 1 : -1);
        if (isFile) FileTypeIndex = typeIndex;
        return isFile;
    }
    // Output lines: one ::DIAG:: line, then per pid a ::PID:: header followed
    // by that pid's DOS paths.
    public static List<string> FilesForPids(int[] pids) {
        var lines = new List<string>();
        var sw = Stopwatch.StartNew();
        var order = new List<int>();
        var want = new Dictionary<long, PidState>();
        foreach (int pid in pids) {
            if (pid <= 0 || want.ContainsKey(pid)) continue;
            PidState ps = new PidState();
            ps.Proc = OpenProcess(PROCESS_DUP_HANDLE, false, pid);
            ps.Open = ps.Proc != IntPtr.Zero;
            want[pid] = ps;
            order.Add(pid);
        }
        long total = 0;
        string err = "";
        IntPtr buf = IntPtr.Zero;
        try {
            long size = 4L << 20;
            bool ok = false;
            for (int attempt = 0; attempt < 8 && !ok; attempt++) {
                if (buf != IntPtr.Zero) { Marshal.FreeHGlobal(buf); buf = IntPtr.Zero; }
                buf = Marshal.AllocHGlobal((IntPtr)size);
                int ret;
                uint st = NtQuerySystemInformation(SystemExtendedHandleInformation, buf, (int)size, out ret);
                if (st == STATUS_SUCCESS) { ok = true; break; }
                if (st != STATUS_INFO_LENGTH_MISMATCH) { err = "nt=0x" + st.ToString("X8"); break; }
                // The table can grow between the sizing call and the real one:
                // leave headroom, grow monotonically, cap the allocation.
                long next = Math.Max((long)ret + (1L << 20), size + (size >> 1));
                if (next > MAX_TABLE_BYTES) { err = "table>" + (MAX_TABLE_BYTES >> 20) + "MB"; break; }
                size = next;
            }
            if (ok) {
                long count = Marshal.ReadIntPtr(buf).ToInt64();
                long fit = (size - HEADER) / ENTRY;
                if (count > fit) count = fit;
                total = count;
                IntPtr cur = Process.GetCurrentProcess().Handle;
                long basePtr = buf.ToInt64();
                for (long i = 0; i < count; i++) {
                    IntPtr e = new IntPtr(basePtr + HEADER + i * ENTRY);
                    long pid = Marshal.ReadIntPtr(e, OFF_PID).ToInt64();
                    PidState ps;
                    if (!want.TryGetValue(pid, out ps)) continue;
                    ps.Handles++;
                    if (!ps.Open) continue;
                    ushort typeIndex = (ushort)Marshal.ReadInt16(e, OFF_TYPE);
                    if (FileTypeIndex >= 0 && typeIndex != FileTypeIndex) continue;
                    if (FileTypeIndex < 0 && TypeVerdict[typeIndex & 4095] < 0) continue;
                    IntPtr handle = Marshal.ReadIntPtr(e, OFF_HANDLE);
                    IntPtr dup = IntPtr.Zero;
                    try {
                        if (!DuplicateHandle(ps.Proc, handle, cur, out dup, 0, false, DUPLICATE_SAME_ACCESS)) continue;
                        if (dup == IntPtr.Zero) continue;
                        if (!IsFileHandle(typeIndex, dup)) continue;
                        // Pipes/sockets/consoles are "File" objects too and
                        // GetFinalPathNameByHandle can block on them forever.
                        if (GetFileType(dup) != FILE_TYPE_DISK) continue;
                        StringBuilder sb = new StringBuilder(1024);
                        uint n = GetFinalPathNameByHandle(dup, sb, 1024, 0);
                        if (n > 1024 && n < 32768) {
                            sb = new StringBuilder((int)n + 1);
                            n = GetFinalPathNameByHandle(dup, sb, n + 1, 0);
                        }
                        if (n == 0 || n >= sb.Capacity) continue;
                        string path = Clean(sb.ToString());
                        if (ps.Seen.Add(path)) ps.Paths.Add(path);
                    } catch { }
                    finally { if (dup != IntPtr.Zero) CloseHandle(dup); }
                }
            }
        } catch (Exception ex) { err = "ex=" + ex.GetType().Name; }
        finally { if (buf != IntPtr.Zero) Marshal.FreeHGlobal(buf); }
        foreach (int pid in order) { PidState ps = want[pid]; if (ps.Open) CloseHandle(ps.Proc); }
        lines.Add("::DIAG:: total=" + total + " filetype=" + FileTypeIndex + " ms=" + sw.ElapsedMilliseconds + (err.Length > 0 ? " err=" + err : ""));
        foreach (int pid in order) {
            PidState ps = want[pid];
            lines.Add("::PID:: " + pid + " handles=" + ps.Handles + " open=" + (ps.Open ? "yes" : "no") + " files=" + ps.Paths.Count);
            lines.AddRange(ps.Paths);
        }
        return lines;
    }
}
`;

// Re-runnable in the same PowerShell session: Add-Type of an already-defined
// type THROWS, so compile only when the type isn't there yet.
export function buildHandleScanTypeScript(): string {
  return `if (-not ('HandleScan' -as [type])) {
$code = @'
${HANDLE_SCAN_CS}'@;
Add-Type -TypeDefinition $code -Language CSharp;
}`;
}

// Exported for tests and scripts/print-ps.ts (paste-verbatim debugging).
export function buildHandleScanScript(pids: number[]): string {
  const list = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0);
  return `${buildHandleScanTypeScript()}
[HandleScan]::FilesForPids([int[]]@(${list.join(",")})) | ForEach-Object { $_ }`;
}

// Single-pid spelling kept for tests/print-ps.
export function buildScanScript(pid: number): string {
  return buildHandleScanScript([pid]);
}

export type PidScan = { handles: string; open: string; paths: string[] };
export type HandleScanParse = { diag: string; perPid: Map<number, PidScan> };

// \\?\C:\x and \\?\UNC\srv\share\x -> DOS spellings (the C# already does this;
// repeated here so a stray prefix can never reach existsSync or ranking).
export function cleanFinalPath(p: string): string {
  const t = p.trim();
  if (/^\\\\\?\\UNC\\/i.test(t)) return "\\\\" + t.slice(8);
  if (t.startsWith("\\\\?\\")) return t.slice(4);
  return t;
}

// Pure: ::DIAG:: line + grouped ::PID:: sections. Unknown junk lines (a stray
// Write-Host, a warning) before the first header are ignored.
export function parseHandleScanOutput(stdout: string): HandleScanParse {
  const perPid = new Map<number, PidScan>();
  let diag = "";
  let cur: PidScan | undefined;
  for (const raw of stdout.replace(/^\uFEFF/, "").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const d = /^::DIAG:: (.*)$/.exec(l);
    if (d) {
      diag = d[1]!;
      continue;
    }
    const h = /^::PID:: (\d+) handles=(\S+) open=(\S+)/.exec(l);
    if (h) {
      cur = { handles: h[2]!, open: h[3]!, paths: [] };
      perPid.set(Number(h[1]), cur);
      continue;
    }
    if (!cur) continue;
    const p = cleanFinalPath(l);
    if (p && !cur.paths.includes(p)) cur.paths.push(p);
  }
  return { diag, perPid };
}

// One PowerShell call, one handle-table walk, any number of pids. `pids` may
// be a function: it is evaluated when the call actually reaches the front of
// the ps-queue, so pids requested while the walk was still queued ride along.
// Never throws: failures push `win:scan:fail:*` and yield an empty map.
export async function scanProcessFilesBatch(
  pids: number[] | (() => number[]),
  notes: string[],
  timeoutMs = 4000,
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  let taken: number[] = [];
  try {
    const { stdout } = await execPowerShell(
      () => {
        taken = [...new Set(typeof pids === "function" ? pids() : pids)].filter(
          (p) => Number.isInteger(p) && p > 0,
        );
        return buildHandleScanScript(taken);
      },
      { timeout: Math.min(timeoutMs, 4000), maxBuffer: 8 * 1024 * 1024, notes },
    );
    const { diag, perPid } = parseHandleScanOutput(stdout);
    notes.push(`win:scan:batch:pids=${taken.length} ${diag}`.trim());
    for (const pid of taken) {
      const s = perPid.get(pid);
      out.set(pid, s?.paths ?? []);
      notes.push(
        `win:scan:pid=${pid}:handles=${s?.handles ?? "?"} files=${s?.paths.length ?? 0} open=${s?.open ?? "?"}`,
      );
    }
  } catch (e) {
    notes.push(`win:scan:fail:${describeExecError(e)}`);
  }
  return out;
}

// ---- per-context coalescing batcher ------------------------------------------------

export type BatchExec = (
  take: () => number[],
  notes: string[],
  timeoutMs: number,
) => Promise<Map<number, string[]>>;

type Deferred = { resolve: (v: string[]) => void };
type Batch = { waiting: Map<number, Deferred>; timeoutMs: number };
type BatcherState = { results: Map<number, Promise<string[]>>; open?: Batch | undefined };

const batchers = new WeakMap<CaptureContext, BatcherState>();

// DataLoader-style: every pid requested before the walk reaches the front of
// the ps-queue is folded into that ONE walk (N pids cost one table walk), and
// results are memoized per pid for the life of the context. Never rejects.
// `exec`/`windowMs` are seams for tests.
export function requestProcessScan(
  ctx: CaptureContext,
  pid: number,
  timeoutMs = 4000,
  exec: BatchExec = scanProcessFilesBatch,
  windowMs = 10,
): Promise<string[]> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve([]);
  let st = batchers.get(ctx);
  if (!st) {
    st = { results: new Map() };
    batchers.set(ctx, st);
  }
  const hit = st.results.get(pid);
  if (hit) return hit;
  let batch = st.open;
  const opening = !batch;
  if (!batch) {
    batch = { waiting: new Map(), timeoutMs };
    st.open = batch;
  }
  batch.timeoutMs = Math.max(batch.timeoutMs, timeoutMs);
  const p = new Promise<string[]>((resolve) => batch.waiting.set(pid, { resolve }));
  st.results.set(pid, p);
  // Start AFTER the pid is registered: the walk's take() must see it.
  if (opening) startBatch(ctx, st, batch, exec, windowMs);
  return p;
}

function startBatch(
  ctx: CaptureContext,
  st: BatcherState,
  batch: Batch,
  exec: BatchExec,
  windowMs: number,
): void {
  void (async () => {
    // Let same-tick requesters (Promise.all over windows) join before the
    // walk is queued; late joiners still fold in via take() below.
    await new Promise((r) => setTimeout(r, Math.max(0, windowMs)));
    let claimed: Map<number, Deferred> | undefined;
    const take = (): number[] => {
      // The walk is starting: close the batch so later requests open the next.
      if (st.open === batch) st.open = undefined;
      claimed = new Map(batch.waiting);
      return [...claimed.keys()];
    };
    let result = new Map<number, string[]>();
    try {
      result = await exec(take, ctx.notes, batch.timeoutMs);
    } catch (e) {
      ctx.notes.push(`win:scan:fail:${describeExecError(e)}`);
    }
    if (!claimed) take(); // executor never started a walk: settle everyone empty
    for (const [pid, d] of claimed!) d.resolve(result.get(pid) ?? []);
  })();
}

// Best ranked path for one pid; through the batcher when a ctx is given.
// `windowTitle` lets a title naming one of the open files beat plain rank.
export async function scanProcessFiles(
  pid: number,
  notes: string[] = [],
  timeoutMs = 4000,
  ctx?: CaptureContext,
  windowTitle?: string,
): Promise<string | undefined> {
  const paths = ctx
    ? await requestProcessScan(ctx, pid, timeoutMs)
    : ((await scanProcessFilesBatch([pid], notes, timeoutMs)).get(pid) ?? []);
  const picked = pickBestPath(rankCandidatePaths(paths), windowTitle);
  // When nothing is picked, the held-but-ignored extensions distinguish
  // "player idle" (dll/pri/dat) from "video under an odd extension".
  const others = nonScannableExtensions(paths).slice(0, 8).join(",");
  notes.push(
    `win:scan:pid=${pid} files=${paths.length} picked=${picked ? "yes" : "no"}${others ? ` others=${others}` : ""}`,
  );
  return picked;
}

// Pure: distinct extensions the scanner saw but ignored (capped by caller).
export function nonScannableExtensions(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const m = /\.([a-z0-9]+)$/i.exec(p.trim());
    if (m && !SCANNABLE_EXTENSIONS.has(m[1]!.toLowerCase())) out.add(m[1]!.toLowerCase());
  }
  return [...out];
}
