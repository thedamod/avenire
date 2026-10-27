import { expect, it } from "vite-plus/test";
import { nativeFile } from "./native-file.ts";
import { captureItems } from "./pipeline.ts";
import type { CaptureSnapshot } from "@avenire/contracts";
import { normalizeCapturePath, readableLocalPath } from "./local-file.ts";

it("reduces a realistic Windows enumeration to resolved document/media rows", () => {
  const fixture = [
    ["WINWORD", "Thesis - Word", String.raw`C:\Users\Student\Thesis.docx`],
    ["EXCEL", "Results - Excel", String.raw`C:\Users\Student\Results.xlsx`],
    ["Acrobat", "Lecture.pdf", String.raw`\\?\C:\Users\Student\Lecture.pdf`],
    ["VLC", "Lecture recording", String.raw`C:\Users\Student\Lecture.mp4`],
    ["Microsoft.Media.Player", "Seminar", String.raw`C:\Users\Student\Seminar.mp4`],
    ["notepad++", "Notes.txt", String.raw`C:\Users\Student\Notes.txt`],
    ["notepad++", "app.ts", String.raw`C:\Users\Student\app.ts`],
    ["WINWORD", "Document1", undefined],
    ["WINWORD", "Owner lock", String.raw`C:\Users\Student\~$Thesis.docx`],
    ["TextInputHost", "Windows Input Experience", undefined],
    ["explorer", "Program Manager", undefined],
    ["ShellExperienceHost", "Windows shell", undefined],
    ["StartMenuExperienceHost", "Start", undefined],
    ["ApplicationFrameHost", "Blank application", undefined],
    ["SystemSettings", "Settings", undefined],
    ["Taskmgr", "Task Manager", undefined],
    ["NVIDIA Overlay", "NVIDIA", undefined],
    ["AMDSoftware", "AMD overlay", undefined],
    ["Raycast", "Raycast", String.raw`C:\Users\Student\private.txt`],
    ["PowerToys", "PowerToys", undefined],
    ["Flow.Launcher", "Flow Launcher", undefined],
    ["Everything", "Everything", undefined],
    ["WindowsTerminal", "Terminal", undefined],
    ["Code", "VS Code", String.raw`C:\Users\Student\Notes.md`],
    ["Olk", "Outlook", undefined],
    ["ms-teams", "Teams", undefined],
    ["msedge", "Lecture.pdf", String.raw`C:\Users\Student\Lecture.pdf`],
    ["Avenire", "Avenire", undefined],
  ] as const;
  const windows = fixture.flatMap(([appName, title, path]) => {
    const filePath = nativeFile(appName, path);
    return filePath ? [{ appName, title, filePath, foreground: false }] : [];
  });
  const items = captureItems({
    id: "capture",
    windows,
    media: [],
    tabs: [],
    platform: "win32",
  } as unknown as CaptureSnapshot);
  expect(items.map((item) => item.title)).toEqual([
    "Thesis.docx",
    "Results.xlsx",
    "Lecture.pdf",
    "Lecture.mp4",
    "Seminar.mp4",
    "Notes.txt",
  ]);
  expect(
    captureItems({
      windows: [{ appName: "Raycast", title: "Raycast" }],
      tabs: [],
      platform: "win32",
    } as unknown as CaptureSnapshot),
  ).toEqual([]);
});

it("handles long drive paths and skips NT devices, network paths and Office owner files", () => {
  const path = "C:\\Users\\Student\\" + "long\\".repeat(70) + "Notes.pdf";
  expect(path.length).toBeGreaterThan(260);
  expect(readableLocalPath(path, "win32")).toBe("\\\\?\\" + path);
  expect(normalizeCapturePath(String.raw`\\?\C:\Users\Student\Notes.pdf`)).toBe(
    String.raw`C:\Users\Student\Notes.pdf`,
  );
  expect(nativeFile("Acrobat", String.raw`\Device\HarddiskVolume3\Notes.pdf`)).toBeUndefined();
  expect(nativeFile("Acrobat", String.raw`\\server\share\Notes.pdf`)).toBeUndefined();
  expect(nativeFile("WINWORD", String.raw`C:\Users\Student\~$Notes.docx`)).toBeUndefined();
});

it.each([
  "Films & TV",
  "Movies & TV",
  "Groove Music",
  "QuickTimePlayer",
  "mpv-bundle",
  "IINA",
  "mpc-be",
  "PotPlayerMini64",
])("accepts resolved media under the collector's %s alias", (app) => {
  expect(nativeFile(app, "C:\\Users\\Student\\Lecture.mp4")).toBe(
    "C:\\Users\\Student\\Lecture.mp4",
  );
});
