import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  getBackgroundMediaLinux,
  mprisUrlToPath,
  parsePlayerctlRecords,
} from "./background-media-linux.ts";
import { parseWmctrl } from "./background-windows-linux.ts";
import { parseLsofNames } from "./document-path-mac.ts";
import { pathsFromCmdline, resolveDocumentPathLinux } from "./document-path-linux.ts";
import { createCaptureContext } from "./capture-context.ts";

const FS = "\x1f";
const RS = "\x1e";
const rec = (...f: string[]) => f.join(FS) + RS + "\n";

describe("parsePlayerctlRecords", () => {
  it("parses one record per player with µs → seconds", () => {
    const out = parsePlayerctlRecords(
      rec(
        "vlc",
        "Playing",
        "12500000",
        "300000000",
        "file:///home/a/x.mp4",
        "Artist",
        "Lecture 1",
      ) + rec("firefox.instance42", "Paused", "", "", "https://y", "", "Tab"),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      instance: "vlc",
      status: "playing",
      positionSec: 12.5,
      durationSec: 300,
      artist: "Artist",
      title: "Lecture 1",
    });
    expect(out[1]!.positionSec).toBeUndefined();
    expect(out[1]!.durationSec).toBeUndefined();
  });
  it("survives tabs/newlines/pipes in titles and garbage", () => {
    const out = parsePlayerctlRecords(
      rec("mpv", "Paused", "0", "10000000", "", "", "a\tb | c\nd") + "garbage" + RS,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("a\tb | c\nd");
    expect(parsePlayerctlRecords("")).toEqual([]);
    expect(parsePlayerctlRecords("No players found\n")).toEqual([]);
  });
});

describe("mprisUrlToPath", () => {
  it("decodes file URLs, rejects streams", () => {
    expect(mprisUrlToPath("file:///home/a/My%20Lecture.mp4")).toBe("/home/a/My Lecture.mp4");
    expect(mprisUrlToPath("https://x/y.mp4")).toBeUndefined();
  });
});

describe("parseWmctrl", () => {
  it("extracts pid + title, skips untitled/garbage", () => {
    const out = parseWmctrl(
      "0x04a00003  0 1234  host  Notes - Okular\n0x1 -1 99 host \nnope\n0x05 0 77 h My Window",
    );
    expect(out).toEqual([
      { pid: 1234, title: "Notes - Okular" },
      { pid: 77, title: "My Window" },
    ]);
  });
});

describe("parseLsofNames", () => {
  it("keeps real fds, drops cwd/rtd/txt/mem and non-paths", () => {
    const out = [
      "p123",
      "fcwd",
      "n/Users/a",
      "ftxt",
      "n/Applications/Preview.app/Contents/MacOS/Preview",
      "fmem",
      "n/System/Library/Fonts/x.ttf",
      "f12",
      "n/Users/a/Documents/essay.pdf",
      "f13",
      "nTCP *:80",
      "f14",
      "n/dev/null",
    ].join("\n");
    expect(parseLsofNames(out)).toEqual(["/Users/a/Documents/essay.pdf", "/dev/null"]);
  });
});

describe("pathsFromCmdline", () => {
  it("handles absolute, relative, --opt=, file:// and skips argv0/flags", () => {
    const cl = [
      "/usr/bin/zathura",
      "--fork",
      "thesis.pdf",
      "--file=/home/a/b.pdf",
      "file:///home/a/My%20c.pdf",
      "/usr/lib/x.so",
      "https://x/y.pdf",
    ].join("\0");
    expect(pathsFromCmdline(cl, "/home/a/papers")).toEqual([
      "/home/a/papers/thesis.pdf",
      "/home/a/b.pdf",
      "/home/a/My c.pdf",
    ]);
  });
  it("drops relative args without a cwd", () => {
    expect(pathsFromCmdline("/bin/x\0a.pdf\0/abs/b.pdf")).toEqual(["/abs/b.pdf"]);
  });
});

describe.runIf(process.platform === "linux")("linux collectors (live, never throw)", () => {
  it("resolveDocumentPathLinux finds an fd-held scannable file and memoizes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "avn-"));
    const f = join(dir, "essay.pdf");
    writeFileSync(f, "%PDF");
    const fd = openSync(f, "r");
    try {
      const notes: string[] = [];
      const ctx = createCaptureContext(notes);
      const app = {
        bundleIdOrExe: "x",
        appName: "x",
        windowTitle: "essay.pdf",
        processId: process.pid,
        isPrivateWindow: false,
      };
      expect(await resolveDocumentPathLinux(app, notes, ctx)).toBe(f);
      expect(await resolveDocumentPathLinux(app, notes, ctx)).toBe(f);
      expect(notes.filter((n) => n.startsWith("linux:proc:fds="))).toHaveLength(1); // second call is memoized
    } finally {
      closeSync(fd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("resolveDocumentPathLinux: no pid / dead pid → undefined", async () => {
    const notes: string[] = [];
    expect(
      await resolveDocumentPathLinux(
        { bundleIdOrExe: "x", appName: "x", windowTitle: "", isPrivateWindow: false },
        notes,
      ),
    ).toBeUndefined();
    expect(
      await resolveDocumentPathLinux(
        {
          bundleIdOrExe: "x",
          appName: "x",
          windowTitle: "",
          processId: 2 ** 30,
          isPrivateWindow: false,
        },
        notes,
      ),
    ).toBeUndefined();
  });
  it("getBackgroundMediaLinux without playerctl/players resolves to an array", async () => {
    expect(Array.isArray(await getBackgroundMediaLinux([]))).toBe(true);
  });
});
