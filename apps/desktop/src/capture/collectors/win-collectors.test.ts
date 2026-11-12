import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createCaptureContext } from "./capture-context.ts";

// ps-queue is the ONE gate to PowerShell: mock it and every Windows collector
// can be exercised end-to-end (script text in, stdout fixtures out) on Linux.
vi.mock("../../config.ts", () => ({ powerShellOneShot: false }));
const ps = vi.hoisted(() => ({
  calls: [] as string[],
  handler: (_script: string): { stdout: string; stderr: string } => ({ stdout: "", stderr: "" }),
}));
vi.mock("./ps-queue.ts", () => ({
  runPsQueue: <T>(t: () => Promise<T>) => t(),
  execPowerShell: async (cmd: string | (() => string)) => {
    const script = typeof cmd === "function" ? cmd() : cmd;
    ps.calls.push(script);
    return ps.handler(script);
  },
}));

import {
  getBackgroundMediaWindows,
  buildSmtcScript,
  buildWinRtWarmScript,
  buildAwaitWinRtHelper,
} from "./background-media-win.ts";
import {
  buildOfficeDocsScript,
  buildWindowsScript,
  getBackgroundWindowsWindows,
  parseOfficeDocsOutput,
  parseWindowsOutput,
  pickWindowFile,
} from "./background-windows-win.ts";
import {
  buildComActiveScript,
  buildRecentScript,
  parseRecentOutput,
  pickScannedPath,
  scanSiblings,
} from "./document-path-win.ts";
import {
  buildHandleScanScript,
  buildHandleScanTypeScript,
  cleanFinalPath,
  parseHandleScanOutput,
  requestProcessScan,
  scanProcessFiles,
  scanProcessFilesBatch,
  type BatchExec,
} from "./handle-scan-win.ts";
import { getNowPlayingWindows, getTimelineWindows } from "./now-playing-win.ts";
import { buildHostLoop } from "./ps-host.ts";

const scanOut = (...groups: [number, string[]][]) =>
  [
    "::DIAG:: total=1000 filetype=42 ms=5",
    ...groups.flatMap(([pid, paths]) => [
      `::PID:: ${pid} handles=${paths.length + 3} open=yes files=${paths.length}`,
      ...paths,
    ]),
  ].join("\n");

beforeEach(() => {
  ps.calls.length = 0;
  ps.handler = () => ({ stdout: "", stderr: "" });
});

// ---- script text invariants (no PowerShell here to execute them) ----------------

const ALL_SCRIPTS: [string, string][] = [
  ["host loop", buildHostLoop()],
  ["smtc", buildSmtcScript()],
  ["winrt helper", buildAwaitWinRtHelper()],
  ["winrt warm", buildWinRtWarmScript()],
  ["handle scan", buildHandleScanScript([1234, 70000])],
  ["handle scan type", buildHandleScanTypeScript()],
  ["recent", buildRecentScript()],
  ["windows (fallback)", buildWindowsScript()],
  ["office docs", buildOfficeDocsScript()],
  ["com word", buildComActiveScript("Word.Application", "ActiveDocument.FullName")],
];

describe("script invariants (everything routed through the host)", () => {
  it.each(ALL_SCRIPTS)("%s: no backticks, no [$var] literals", (_n, s) => {
    expect(s).not.toContain("`"); // F7
    expect(s).not.toMatch(/\[\$\w+\]/); // F6
  });

  it.each(ALL_SCRIPTS)("%s: no bare exit (it would kill the persistent host)", (_n, s) => {
    // statement-level `exit`, `exit 1`, `{exit 1}` — not words like "exited" in strings
    expect(s).not.toMatch(/(^|[;{}\s(])exit(\s+-?\d+)?\s*([;}]|$)/im);
  });

  it("no collector source routes an `exit` statement either", () => {
    for (const f of [
      "now-playing-win",
      "background-media-win",
      "background-windows-win",
      "document-path-win",
      "handle-scan-win",
    ]) {
      const src = readFileSync(new URL(`./${f}.ts`, import.meta.url), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(src, f).not.toMatch(/[;{'"\s]exit\s+[01]\b/);
      expect(src, f).not.toMatch(/\{\s*exit\s*\}/);
    }
  });

  it("every Add-Type compile is guarded so a re-run in the same session is a no-op", () => {
    for (const [name, s] of ALL_SCRIPTS) {
      if (/Add-Type\s+(-TypeDefinition|-Namespace)/.test(s)) {
        expect(s, name).toMatch(/if \(-not \('[\w.]+' -as \[type\]\)\)/);
      }
    }
    expect(buildHandleScanTypeScript()).toContain("if (-not ('HandleScan' -as [type]))");
    expect(buildAwaitWinRtHelper()).toContain(
      "if (-not ('System.WindowsRuntimeSystemExtensions' -as [type])) { Add-Type -AssemblyName System.Runtime.WindowsRuntime }",
    );
  });

  it("handle scan: class 64 (extended), exact x64 layout, GetFileType gate, cached File type index", () => {
    const s = buildHandleScanScript([1]);
    expect(s).toContain("SystemExtendedHandleInformation = 64");
    expect(s).not.toContain("SystemHandleInformation = 16");
    // 3 pointer-sized fields + ULONG + 2xUSHORT + 2xULONG = 40 bytes on x64
    expect(s).toContain("ENTRY = 3 * IntPtr.Size + 16");
    expect(s).toContain("HEADER = 2 * IntPtr.Size");
    expect(s).toContain("OFF_TYPE = 3 * IntPtr.Size + 6");
    expect(s).toContain("GetFileType");
    expect(s).toContain("FILE_TYPE_DISK");
    expect(s).toContain("FileTypeIndex");
    expect(s).toContain("STATUS_INFO_LENGTH_MISMATCH");
    expect(s).toContain("MAX_TABLE_BYTES");
    expect(s).toContain("DuplicateHandle(IntPtr srcProc, IntPtr srcHandle"); // 16-bit handle values are gone
    expect(s).toContain("FilesForPids([int[]]@(1))");
    // C# 5 only (Add-Type uses the CodeDom compiler): no newer syntax slipped in
    const cs = buildHandleScanTypeScript();
    expect(cs).not.toMatch(/\?\.|\bout var\b|\$"|=>|nameof\(/);
  });

  it("handle scan: strips \\\\?\\ and rewrites \\\\?\\UNC\\ to \\\\ (C# literals exact)", () => {
    const s = buildHandleScanTypeScript();
    expect(s).toContain('@"\\\\?\\UNC\\"');
    expect(s).toContain('@"\\\\" + p.Substring(8)');
    expect(s).toContain('@"\\\\?\\"');
    expect(s).toContain("p.Substring(4)");
  });

  it("PS pid list de-dupes and drops junk; >65535 pids survive", () => {
    expect(buildHandleScanScript([70000, 70000, 12, -1, 0, 1.5])).toContain(
      "FilesForPids([int[]]@(70000,12))",
    );
  });

  it("one-shot and host paths both set UTF-8 (so non-ASCII paths survive)", () => {
    expect(buildHostLoop()).toContain("[Console]::OutputEncoding");
    const src = readFileSync(new URL("./ps-queue.ts", import.meta.url), "utf8");
    expect(src).toContain("buildUtf8Prelude()");
  });

  it("SMTC: ONE script returns sessions + current; Await-WinRT AsTask pattern kept", () => {
    const s = buildSmtcScript();
    expect(s).toContain("GetCurrentSession");
    expect(s).toContain("SourceAppUserModelId");
    expect(s).toContain("AsTask");
    expect((s.match(/RequestAsync\(\)/g) ?? []).length).toBe(1);
    // Timeline is a SYNC method on a type that actually exists
    expect(s).toContain("GetTimelineProperties()");
    expect(s).not.toContain("GetTimelinePropertiesAsync");
    expect(s).not.toContain("GlobalSystemMediaTransportControlsTimelineProperties");
    // stderr via Console.Error would bypass the host's capture: errors are stdout markers
    expect(s).not.toContain("[Console]::Error");
    expect(s).toContain("::ERR::");
  });
});

// ---- handle scan output + path hygiene ----------------------------------------------

describe("handle scan parsing", () => {
  it("groups paths per pid and keeps the diag line", () => {
    const p = parseHandleScanOutput(
      scanOut([10, ["C:\\Users\\u\\a.pdf", "C:\\Windows\\x.dll"]], [11, []]).replace(
        "::DIAG::",
        "stray warning\n::DIAG::",
      ),
    );
    expect(p.diag).toBe("total=1000 filetype=42 ms=5");
    expect(p.perPid.get(10)?.paths).toEqual(["C:\\Users\\u\\a.pdf", "C:\\Windows\\x.dll"]);
    expect(p.perPid.get(11)).toMatchObject({ paths: [], open: "yes" });
  });
  it("cleans extended-length prefixes defensively", () => {
    expect(cleanFinalPath("\\\\?\\C:\\Users\\u\\a.pdf")).toBe("C:\\Users\\u\\a.pdf");
    expect(cleanFinalPath("\\\\?\\UNC\\srv\\share\\a.pdf")).toBe("");
    expect(cleanFinalPath("C:\\plain.pdf")).toBe("C:\\plain.pdf");
    const p = parseHandleScanOutput(
      "::PID:: 5 handles=1 open=yes files=1\n\\\\?\\C:\\x.pdf\n\\\\?\\UNC\\s\\h\\y.pdf",
    );
    expect(p.perPid.get(5)?.paths).toEqual(["C:\\x.pdf"]);
  });
  it("keeps non-ASCII paths intact", () => {
    const p = parseHandleScanOutput(
      "::PID:: 5 handles=1 open=yes files=1\nC:\\Users\\Zo\u00eb\\OneDrive - \u5927\u5b66\\caf\u00e9 \u4e2d\u6587.pdf",
    );
    expect(p.perPid.get(5)?.paths[0]).toBe(
      "C:\\Users\\Zo\u00eb\\OneDrive - \u5927\u5b66\\caf\u00e9 \u4e2d\u6587.pdf",
    );
  });
});

describe("scanProcessFilesBatch", () => {
  it("ONE PowerShell call for N pids, per-pid results + notes", async () => {
    ps.handler = () => ({
      stdout: scanOut([10, ["C:\\a.pdf"]], [11, ["C:\\b.pdf"]], [70000, []]),
      stderr: "",
    });
    const notes: string[] = [];
    const r = await scanProcessFilesBatch([10, 11, 70000, 10], notes, 5000);
    expect(ps.calls).toHaveLength(1);
    expect(ps.calls[0]).toContain("@(10,11,70000)");
    expect([...r.entries()]).toEqual([
      [10, ["C:\\a.pdf"]],
      [11, ["C:\\b.pdf"]],
      [70000, []],
    ]);
    expect(notes.some((n) => n.startsWith("win:scan:batch:pids=3 total=1000"))).toBe(true);
    expect(notes).toContain("win:scan:pid=70000:handles=3 files=0 open=yes");
  });
  it("a pid provider is evaluated when the call runs; failures degrade with a note", async () => {
    let evaluated = false;
    ps.handler = () => {
      throw Object.assign(new Error("x"), { killed: true });
    };
    const notes: string[] = [];
    const r = await scanProcessFilesBatch(() => ((evaluated = true), [5]), notes, 10);
    expect(evaluated).toBe(true);
    expect(r.size).toBe(0);
    expect(notes[0]).toMatch(/^win:scan:fail:timeout/);
  });
});

describe("requestProcessScan batcher", () => {
  const exec =
    (log: number[][]): BatchExec =>
    async (take) => {
      const pids = take();
      log.push(pids);
      return new Map(pids.map((p) => [p, [`C:\\f${p}.pdf`]]));
    };

  it("folds same-tick requests into one walk and memoizes per pid", async () => {
    const ctx = createCaptureContext();
    const log: number[][] = [];
    const e = exec(log);
    const [a, b, c, a2] = await Promise.all([
      requestProcessScan(ctx, 1, 1000, e, 0),
      requestProcessScan(ctx, 2, 1000, e, 0),
      requestProcessScan(ctx, 3, 1000, e, 0),
      requestProcessScan(ctx, 1, 1000, e, 0),
    ]);
    expect(log).toEqual([[1, 2, 3]]);
    expect([a, b, c, a2]).toEqual([["C:\\f1.pdf"], ["C:\\f2.pdf"], ["C:\\f3.pdf"], ["C:\\f1.pdf"]]);
    // later request for a known pid: memoized, no new walk
    expect(await requestProcessScan(ctx, 2, 1000, e, 0)).toEqual(["C:\\f2.pdf"]);
    expect(log).toHaveLength(1);
  });

  it("pids requested while the walk is still queued ride along; later ones open the next walk", async () => {
    const ctx = createCaptureContext();
    const log: number[][] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r)); // the walk is "queued behind other PS work"
    const e: BatchExec = async (take) => {
      await gate;
      const pids = take();
      log.push(pids);
      return new Map(pids.map((p) => [p, [`C:\\f${p}.pdf`]]));
    };
    const first = requestProcessScan(ctx, 1, 1000, e, 0);
    await new Promise((r) => setTimeout(r, 5));
    const late = requestProcessScan(ctx, 2, 1000, e, 0); // walk not started yet
    release();
    await Promise.all([first, late]);
    expect(log).toEqual([[1, 2]]);
    // after take(): a new request opens a NEW walk
    const next = await requestProcessScan(ctx, 3, 1000, exec(log), 0);
    expect(next).toEqual(["C:\\f3.pdf"]);
    expect(log).toEqual([[1, 2], [3]]);
  });

  it("contexts are isolated (no cross-snapshot memo)", async () => {
    const log: number[][] = [];
    await requestProcessScan(createCaptureContext(), 1, 1000, exec(log), 0);
    await requestProcessScan(createCaptureContext(), 1, 1000, exec(log), 0);
    expect(log).toEqual([[1], [1]]);
  });

  it("never rejects: executor errors and walkless executors settle with []", async () => {
    const ctx = createCaptureContext();
    const boom: BatchExec = async () => {
      throw Object.assign(new Error("x"), { killed: true });
    };
    expect(await requestProcessScan(ctx, 9, 1000, boom, 0)).toEqual([]);
    expect(ctx.notes.some((n) => n.startsWith("win:scan:fail:timeout"))).toBe(true);
    const lazy: BatchExec = async () => new Map();
    expect(await requestProcessScan(ctx, 10, 1000, lazy, 0)).toEqual([]);
    expect(await requestProcessScan(ctx, -1)).toEqual([]);
  });
});

describe("scanProcessFiles uses the shared ranker", () => {
  it("prefers user documents over app assets, via the batcher when given a ctx", async () => {
    ps.handler = () => ({
      stdout: scanOut([
        42,
        [
          "C:\\Program Files\\VideoLAN\\VLC\\license.txt",
          "C:\\Windows\\Fonts\\arial.ttf",
          "C:\\Users\\u\\AppData\\Local\\Temp\\cache.mp4",
          "C:\\Users\\u\\Videos\\lecture 01.mp4",
        ],
      ]),
      stderr: "",
    });
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    const hit = await scanProcessFiles(42, notes, 5000, ctx);
    expect(hit).toBe("C:\\Users\\u\\Videos\\lecture 01.mp4");
    expect(notes.some((n) => n.startsWith("win:scan:pid=42 files=4 picked=yes"))).toBe(true);
  });
  it("a window title naming one open file beats rank", async () => {
    ps.handler = () => ({
      stdout: scanOut([
        7,
        ["C:\\Users\\u\\Documents\\a.pdf", "D:\\papers\\Attention is all you need.pdf"],
      ]),
      stderr: "",
    });
    const hit = await scanProcessFiles(
      7,
      [],
      5000,
      createCaptureContext(),
      "Attention is all you need.pdf - Sumatra",
    );
    expect(hit).toBe("D:\\papers\\Attention is all you need.pdf");
  });
  it("returns undefined when only assets are held, and says what was ignored", async () => {
    ps.handler = () => ({
      stdout: scanOut([7, ["C:\\Program Files\\App\\a.pdf", "C:\\Users\\u\\x.dat"]]),
      stderr: "",
    });
    const notes: string[] = [];
    expect(await scanProcessFiles(7, notes, 5000)).toBeUndefined();
    expect(notes.some((n) => n.includes("picked=no") && n.includes("others=dat"))).toBe(true);
  });
  it("pickScannedPath stays a thin wrapper over the ranker", () => {
    expect(pickScannedPath(["C:\\Windows\\a.pdf", "C:\\Users\\u\\Documents\\b.pdf"])).toBe(
      "C:\\Users\\u\\Documents\\b.pdf",
    );
    expect(pickScannedPath([])).toBeUndefined();
  });
});

// ---- siblings ------------------------------------------------------------------------

describe("scanSiblings", () => {
  it("uses the shared process list (no PowerShell for the lookup) and ONE walk for both pids", async () => {
    const ctx = createCaptureContext();
    await ctx.memo("procs", async () => [
      { pid: 100, name: "vlc" },
      { pid: 101, name: "VLC" },
      { pid: 102, name: "vlc" },
      { pid: 103, name: "vlc" },
      { pid: 200, name: "other" },
    ]);
    ps.handler = () => ({
      stdout: scanOut([101, []], [102, ["C:\\Users\\u\\Videos\\talk.mkv"]]),
      stderr: "",
    });
    const notes: string[] = [];
    const hit = await scanSiblings("vlc", 100, notes, ctx);
    expect(hit).toBe("C:\\Users\\u\\Videos\\talk.mkv");
    expect(notes).toContain("win:siblings:vlc:count=2");
    expect(ps.calls).toHaveLength(1);
    expect(ps.calls[0]).toContain("@(101,102)");
    expect(ps.calls[0]).not.toContain("Get-Process");
  });
});

// ---- background windows ----------------------------------------------------------------

describe("getBackgroundWindowsWindows", () => {
  it("native window list, one handle walk for all target pids, per-window file picking, Office via COM", async () => {
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    await ctx.memo("windows", async () => [
      { pid: 1, appName: "SumatraPDF", title: "a.pdf - SumatraPDF" },
      { pid: 1, appName: "SumatraPDF", title: "b.pdf - SumatraPDF" },
      { pid: 1, appName: "SumatraPDF", title: "untitled-third - SumatraPDF" },
      { pid: 2, appName: "Acrobat", title: "Syllabus" },
      { pid: 3, appName: "chrome", title: "tab - Chrome" }, // browsers: tab pipeline
      { pid: 4, appName: "WINWORD", title: "essay.docx - Word" },
      { pid: 5, appName: "Slack", title: "general" }, // not a local-file target: no scan
      { pid: 99, appName: "Foreground", title: "fg" },
    ]);
    ps.handler = (script) => {
      if (script.includes("Word.Application"))
        return { stdout: "::DOC:: Word\tC:\\Users\\u\\Documents\\essay.docx\n", stderr: "" };
      return {
        stdout: scanOut(
          [1, ["C:\\Users\\u\\Documents\\a.pdf", "C:\\Users\\u\\Documents\\b.pdf"]],
          [2, ["C:\\Users\\u\\Documents\\Syllabus.pdf"]],
        ),
        stderr: "",
      };
    };
    const out = await getBackgroundWindowsWindows(99, notes, ctx);
    const byTitle = new Map(out.map((w) => [w.windowTitle, w]));
    expect(byTitle.get("a.pdf - SumatraPDF")?.filePath).toBe("C:\\Users\\u\\Documents\\a.pdf");
    expect(byTitle.get("b.pdf - SumatraPDF")?.filePath).toBe("C:\\Users\\u\\Documents\\b.pdf");
    // two windows share a pid: an un-named third never inherits rank-1 by guesswork
    expect(byTitle.get("untitled-third - SumatraPDF")?.filePath).toBeUndefined();
    expect(byTitle.get("Syllabus")?.filePath).toBe("C:\\Users\\u\\Documents\\Syllabus.pdf");
    expect(byTitle.get("essay.docx - Word")?.filePath).toBe("C:\\Users\\u\\Documents\\essay.docx");
    expect(byTitle.has("tab - Chrome")).toBe(false);
    expect(byTitle.has("fg")).toBe(false);
    expect(byTitle.get("general")?.filePath).toBeUndefined();
    // exactly one handle-table walk, covering pids 1 and 2 only
    const walks = ps.calls.filter((c) => c.includes("FilesForPids"));
    expect(walks).toHaveLength(1);
    expect(walks[0]).toContain("@(1,2)");
    expect(notes).toContain("win:bgwin:source=native");
    expect(notes.some((n) => n.startsWith("win:bgwin:office:docs=1"))).toBe(true);
  });

  it("caps one walk at 8 pids", async () => {
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    await ctx.memo("windows", async () =>
      Array.from({ length: 12 }, (_, i) => ({
        pid: 100 + i,
        appName: "SumatraPDF",
        title: `d${i}.pdf - SumatraPDF`,
      })),
    );
    ps.handler = (s) => ({ stdout: s.includes("FilesForPids") ? scanOut() : "", stderr: "" });
    await getBackgroundWindowsWindows(undefined, notes, ctx);
    const walk = ps.calls.find((c) => c.includes("FilesForPids"))!;
    expect(walk.match(/@\(([\d,]+)\)/)![1]!.split(",")).toHaveLength(8);
  });

  it("falls back to the EnumWindows script only when native enumeration is unavailable", async () => {
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    await ctx.memo("windows", async () => undefined);
    ps.handler = (s) => ({
      stdout: s.includes("EnumWindows")
        ? "::WIN:: 6\tNotepad\tnotes.txt - Notepad\n::WIN:: 7\tchrome\tx\n"
        : "",
      stderr: "",
    });
    const out = await getBackgroundWindowsWindows(undefined, notes, ctx);
    expect(out).toEqual([]); // Unknown/unresolved windows never become capture rows.
    expect(notes).toContain("win:bgwin:source=powershell");
  });

  it("pure helpers: window/doc/recent parsers and pickWindowFile", () => {
    expect(parseWindowsOutput("::WIN:: 5\tNotepad\tt - Notepad\njunk")).toEqual([
      { pid: 5, proc: "Notepad", title: "t - Notepad" },
    ]);
    expect(parseOfficeDocsOutput("::DOC:: Word\tC:\\a.docx\n::DOC:: Excel\t")).toEqual([
      { appName: "Word", path: "C:\\a.docx" },
    ]);
    expect(parseRecentOutput("2026-01-01T00:00:00.0000000Z|C:\\x\\y.pdf\nbad")).toHaveLength(1);
    const ranked = ["C:\\Users\\u\\Documents\\a.pdf", "C:\\Users\\u\\Documents\\b.pdf"];
    expect(pickWindowFile(ranked, "whatever", false)).toBe(ranked[0]);
    expect(pickWindowFile(ranked, "whatever", true)).toBeUndefined();
    expect(pickWindowFile(ranked, "b.pdf - Viewer", true)).toBe(ranked[1]);
    expect(pickWindowFile([], "x", false)).toBeUndefined();
  });
});

// ---- SMTC once + media ----------------------------------------------------------------------

const SMTC_STDOUT = [
  "::CURRENT:: Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo",
  "::SESSION:: Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo\tProf\tLEC 8\tPlaying\t100\t400",
  "::SESSION:: Chrome\t\tTab video\tPlaying\t1\t2",
  "::SESSION:: SpotifyAB.SpotifyMusic_x!Spotify\tDJ\tLo-fi\tPaused\t5\t50",
].join("\n");

describe("SMTC is read once per snapshot", () => {
  it("now-playing, timeline and background media share ONE script call", async () => {
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    await ctx.memo("procs", async () => [
      { pid: 300, name: "Microsoft.Media.Player" },
      { pid: 301, name: "chrome" },
    ]);
    ps.handler = (s) => ({
      stdout: s.includes("GetSessions")
        ? SMTC_STDOUT
        : s.includes("FilesForPids")
          ? scanOut([300, ["C:\\Users\\u\\Videos\\LEC 8.mp4"]])
          : "",
      stderr: "",
    });
    const [np, tl, bg] = await Promise.all([
      getNowPlayingWindows(ctx),
      getTimelineWindows(ctx),
      getBackgroundMediaWindows(notes, ctx),
    ]);
    expect(np).toEqual({ artist: "Prof", title: "LEC 8" });
    expect(tl).toEqual({ positionSec: 100, durationSec: 400 });
    expect(ps.calls.filter((c) => c.includes("GetSessions"))).toHaveLength(1);
    expect(ps.calls.filter((c) => c.includes("FilesForPids"))).toHaveLength(1);
    expect(ps.calls.filter((c) => c.includes("FilesForPids"))[0]).toContain("@(300)");
    // Browser timelines remain separate; local files match within their player family.
    expect(bg.map((b) => b.title).sort()).toEqual(["LEC 8", "Lo-fi", "Tab video"].sort());
    expect(bg.find((b) => b.title === "LEC 8")?.positionSec).toBe(100);
    expect(notes.some((n) => n.startsWith("win:bgmedia:sessions=3["))).toBe(true);
  });

  it("SMTC failure degrades with a note and does not break the proc scans", async () => {
    const notes: string[] = [];
    const ctx = createCaptureContext(notes);
    await ctx.memo("procs", async () => [{ pid: 300, name: "vlc" }]);
    ps.handler = (s) => {
      if (s.includes("GetSessions")) return { stdout: "::ERR:: Unable to find type", stderr: "" };
      return { stdout: scanOut([300, ["C:\\Users\\u\\Videos\\talk.mkv"]]), stderr: "" };
    };
    const bg = await getBackgroundMediaWindows(notes, ctx);
    expect(bg).toHaveLength(1);
    expect(bg[0]!.filePath).toBe("C:\\Users\\u\\Videos\\talk.mkv");
    expect(notes.some((n) => n.startsWith("win:bgmedia:smtc:err:"))).toBe(true);
    expect(await getNowPlayingWindows(ctx)).toBeUndefined();
    expect(await getTimelineWindows(ctx)).toBeUndefined();
  });

  it("timeline needs a real duration", async () => {
    const ctx = createCaptureContext();
    await ctx.memo("win:smtc", async () => ({
      current: "X",
      sessions: [
        {
          aumid: "X",
          appName: "x",
          title: "t",
          status: "Playing",
          positionSec: 5,
          durationSec: undefined,
          browser: false,
        },
      ],
    }));
    expect(await getTimelineWindows(ctx)).toBeUndefined();
    expect(await getNowPlayingWindows(ctx)).toEqual({ title: "t" });
  });
});

it("filters a full Windows window enumeration before scans and excludes every unresolved window", async () => {
  const ctx = createCaptureContext([], 9000);
  const ignored = [
    "TextInputHost",
    "explorer",
    "ShellExperienceHost",
    "StartMenuExperienceHost",
    "ApplicationFrameHost",
    "SystemSettings",
    "Taskmgr",
    "NVIDIA Overlay",
    "AMDSoftware",
    "Raycast",
    "PowerToys",
    "Flow.Launcher",
    "Everything",
    "WindowsTerminal",
    "powershell",
    "cmd",
    "Code",
    "devenv",
    "Olk",
    "Teams",
    "Avenire",
    "msedge",
    "chrome",
  ];
  await ctx.memo("windows", async () => [
    ...ignored.map((appName, i) => ({
      pid: 100 + i,
      appName,
      title: `${appName} background window`,
    })),
    { pid: 1, appName: "WINWORD", title: "Essay.docx - Word" },
    { pid: 2, appName: "SumatraPDF", title: "Lecture.pdf - SumatraPDF" },
    { pid: 3, appName: "Acrobat", title: "Unresolved viewer" },
    { pid: 4, appName: "VLC", title: "Unresolved stream" },
  ]);
  ps.handler = (script) => ({
    stdout: script.includes("Word.Application")
      ? "::DOC:: Word\tC:\\Users\\student\\Essay.docx"
      : script.includes("FilesForPids")
        ? scanOut([2, ["C:\\Users\\student\\Lecture.pdf"]], [3, []])
        : "",
    stderr: "",
  });
  const windows = await getBackgroundWindowsWindows(undefined, ctx.notes, ctx);
  expect(windows.map((window) => window.appName)).toEqual(["WINWORD", "SumatraPDF"]);
  expect(windows.every((window) => window.filePath)).toBe(true);
  const scan = ps.calls.find((script) => script.includes("FilesForPids"));
  expect(scan).toContain("@(2,3)");
});
