import { expect, it } from "vite-plus/test";
import { buildAxWindowsScript, parseAxWindows } from "./background-windows-mac.ts";
import { parseXpropWindow } from "./background-windows-linux.ts";
it("reads AX windows per running app PID and resolves AXDocument file URLs", () => {
  expect(buildAxWindowsScript()).toContain("p.unixId()");
  expect(buildAxWindowsScript()).toContain("AXDocument");
  expect(
    parseAxWindows(
      JSON.stringify([
        {
          pid: 12,
          owner: "Preview",
          title: "My notes",
          document: "file:///Users/student/My%20Notes.pdf",
        },
        { pid: -1, owner: "invalid", title: "" },
      ]),
    ),
  ).toEqual([
    { pid: 12, owner: "Preview", title: "My notes", filePath: "/Users/student/My Notes.pdf" },
  ]);
  expect(parseAxWindows("denied")).toEqual([]);
});
it("parses EWMH window PID and Unicode title with a WM_NAME fallback", () => {
  expect(
    parseXpropWindow(
      '_NET_WM_PID(CARDINAL) = 421\n_NET_WM_NAME(UTF8_STRING) = "Lecture α - Okular"',
    ),
  ).toEqual({ pid: 421, title: "Lecture α - Okular" });
  expect(parseXpropWindow('_NET_WM_PID(CARDINAL) = 421\nWM_NAME(STRING) = "Lecture"')).toEqual({
    pid: 421,
    title: "Lecture",
  });
  expect(parseXpropWindow("denied")).toBeUndefined();
});
