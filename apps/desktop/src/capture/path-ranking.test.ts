import { describe, expect, it } from "vite-plus/test";
import { rankCandidatePaths as rank } from "./research/src/capture/path-ranking.ts";

describe("rankCandidatePaths: drops", () => {
  it.each([
    "C:\\Windows\\Fonts\\readme.txt",
    "C:\\Program Files\\VideoLAN\\VLC\\license.txt",
    "C:\\Program Files (x86)\\Foo\\docs\\manual.pdf",
    "D:\\Program Files\\Foo\\a.txt",
    "C:\\ProgramData\\Foo\\eula.txt",
    "C:\\Users\\a\\AppData\\Local\\Temp\\x.mp4",
    "C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\INetCache\\x.pdf",
    "C:\\Users\\a\\AppData\\Local\\Packages\\Foo_8wekyb\\LocalState\\cache.txt",
    "C:\\Users\\a\\AppData\\Local\\Programs\\Spotify\\notice.txt",
    "E:\\$Recycle.Bin\\S-1-5\\$R1.pdf",
    "C:\\Users\\a\\proj\\node_modules\\x\\README.md",
    "\\\\?\\C:\\Windows\\a.txt",
    "/mnt/c/Windows/System32/a.txt",
    "/mnt/c/Program Files/x/license.txt",
    "/usr/share/doc/foo/README.md",
    "/opt/foo/license.txt",
    "/snap/foo/1/a.txt",
    "/proc/1/a.txt",
    "/dev/shm/a.mp3",
    "/sys/a.txt",
    "/run/user/1000/pulse/a.mp3",
    "/home/a/.cache/x/a.pdf",
    "/home/a/.local/share/Trash/files/a.pdf",
    "/System/Library/a.txt",
    "/Library/Fonts/a.txt",
    "/Applications/Foo.app/Contents/Resources/a.txt",
    "/Users/a/Library/Caches/x/a.pdf",
    "/Users/a/Library/Application Support/x/a.txt",
    "/Users/a/Applications/Foo.app/Contents/Resources/a.pdf",
    "/home/a/proj/node_modules/x/README.md",
    "/home/a/doc.pdf (deleted)",
    "memfd:foo.pdf",
    "/tmp/.mount_FooApp/usr/share/a.txt",
  ])("drops %s", (p) => {
    expect(rank([p])).toEqual([]);
  });

  it("drops non-scannable and junk input", () => {
    expect(rank(["C:\\Users\\a\\Documents\\x.exe", "", "   ", "/home/a/x", "x.bin"])).toEqual([]);
  });

  it("keeps look-alike folders that are not system roots", () => {
    expect(rank(["C:\\Users\\a\\Windows Notes\\a.md"])).toHaveLength(1);
    expect(rank(["/home/a/usr/a.md"])).toHaveLength(1);
    expect(rank(["/home/a/Library of Things/a.md"])).toHaveLength(1);
  });
});

describe("rankCandidatePaths: keeps", () => {
  it.each([
    "/Users/a/Library/Mobile Documents/com~apple~CloudDocs/Essay.pdf",
    "/Users/a/Library/CloudStorage/Dropbox/a.pdf",
    "/Users/a/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/ABC/a.pdf",
    "/run/media/a/USB/a.pdf",
    "/run/user/1000/doc/abcd/a.pdf",
    "/media/a/USB/a.pdf",
    "/Volumes/USB/a.pdf",
    "/tmp/mail-attachment.pdf",
    "/mnt/c/Users/a/Documents/a.pdf",
    "\\\\?\\C:\\Users\\a\\Documents\\a.pdf",
    "\\\\server\\share\\a.pdf",
  ])("keeps %s", (p) => {
    expect(rank([p])).toEqual([p]);
  });
});

describe("rankCandidatePaths: ordering", () => {
  it("Windows: doc roots > other home > other drives > appdata", () => {
    const a = "C:\\Users\\a\\AppData\\Roaming\\Notes\\n.md";
    const b = "D:\\Lectures\\l.mp4";
    const c = "C:\\Users\\a\\Projects\\p.md";
    const d = "C:\\Users\\a\\Documents\\essay.docx";
    const e = "C:\\Users\\a\\OneDrive - School\\x.pdf";
    expect(rank([a, b, c, "C:\\Program Files\\VLC\\license.txt", d, e])).toEqual([d, e, c, b, a]);
  });

  it("POSIX: doc roots > other home > mounts > hidden/tmp", () => {
    const l = [
      "/tmp/att.pdf",
      "/media/a/USB/u.pdf",
      "/home/a/code/notes.md",
      "/home/a/.config/app/c.md",
      "/home/a/Downloads/d.pdf",
      "/usr/share/doc/x/README.md",
      "/Users/b/Movies/m.mp4",
    ];
    expect(rank(l)).toEqual([
      "/home/a/Downloads/d.pdf",
      "/Users/b/Movies/m.mp4",
      "/home/a/code/notes.md",
      "/media/a/USB/u.pdf",
      "/tmp/att.pdf",
      "/home/a/.config/app/c.md",
    ]);
  });

  it("mixed styles and cloud roots outside a home", () => {
    const r = rank([
      "/media/x/a.pdf",
      "G:\\My Drive\\n.docx",
      "D:\\x.pdf",
      "/home/a/Dropbox/d.pdf",
    ]);
    expect(r).toEqual([
      "G:\\My Drive\\n.docx",
      "/home/a/Dropbox/d.pdf",
      "/media/x/a.pdf",
      "D:\\x.pdf",
    ]);
  });

  it("preserves original order within a tier", () => {
    const l = ["/home/a/Documents/z.pdf", "/home/a/Documents/a.pdf", "/home/a/Desktop/m.pdf"];
    expect(rank(l)).toEqual(l);
  });

  it("WSL drive paths rank like Windows ones", () => {
    expect(rank(["/mnt/d/x.pdf", "/mnt/c/Users/a/Desktop/y.pdf"])).toEqual([
      "/mnt/c/Users/a/Desktop/y.pdf",
      "/mnt/d/x.pdf",
    ]);
  });
});

describe("rankCandidatePaths: dedupe", () => {
  it("case-insensitive + slash-insensitive for Windows paths", () => {
    expect(
      rank([
        "C:\\Users\\a\\Documents\\A.pdf",
        "c:\\users\\A\\documents\\a.PDF",
        "C:/Users/a/Documents/a.pdf",
      ]),
    ).toEqual(["C:\\Users\\a\\Documents\\A.pdf"]);
  });
  it("case-sensitive for POSIX paths", () => {
    expect(rank(["/home/a/A.pdf", "/home/a/a.pdf", "/home/a/A.pdf"])).toEqual([
      "/home/a/A.pdf",
      "/home/a/a.pdf",
    ]);
  });
});

import { pickBestPath } from "./research/src/capture/path-ranking.ts";

describe("pickBestPath", () => {
  const r = ["/home/a/Documents/notes.pdf", "/home/a/Downloads/Lecture 3.pdf"];
  it("prefers the title-named file over rank", () => {
    expect(pickBestPath(r, "Lecture 3.pdf - Evince")).toBe(r[1]);
    expect(pickBestPath(r, "lecture 3")).toBe(r[1]);
  });
  it("falls back to the top-ranked path", () => {
    expect(pickBestPath(r, "Untitled")).toBe(r[0]);
    expect(pickBestPath(r)).toBe(r[0]);
    expect(pickBestPath([], "x")).toBeUndefined();
  });
  it("ignores very short stems", () => {
    expect(pickBestPath(["/h/a/Documents/a.pdf", "/h/a/Documents/b.pdf"], "banana")).toBe(
      "/h/a/Documents/a.pdf",
    );
  });
});
