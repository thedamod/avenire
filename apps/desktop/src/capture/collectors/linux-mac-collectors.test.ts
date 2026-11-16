import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { getBackgroundMediaLinux } from "./background-media-linux.ts";
import { resolveDocumentPathLinux } from "./document-path-linux.ts";
import { createCaptureContext } from "./capture-context.ts";
import { nativeFile } from "../native-file.ts";
import { formats } from "../upload.ts";

describe.runIf(process.platform === "linux")("linux collectors (live, never throw)", () => {
  it.each([
    ["odt", "application/vnd.oasis.opendocument.text", "LibreOffice Writer"],
    ["ods", "application/vnd.oasis.opendocument.spreadsheet", "LibreOffice Calc"],
    ["odp", "application/vnd.oasis.opendocument.presentation", "LibreOffice Impress"],
  ])(
    "recovers an open .%s document through the native capture boundary",
    async (ext, mime, appName) => {
      const dir = mkdtempSync(join(tmpdir(), "avn-office-"));
      const path = join(dir, `Study notes.${ext}`);
      writeFileSync(path, "fixture");
      const fd = openSync(path, "r");
      try {
        const resolved = await resolveDocumentPathLinux({
          bundleIdOrExe: "soffice.bin",
          appName,
          windowTitle: `Study notes.${ext} — ${appName}`,
          processId: process.pid,
          isPrivateWindow: false,
        });
        expect(resolved).toBe(path);
        for (const name of [appName, "libreoffice", "soffice", "soffice.bin"]) {
          expect(nativeFile(name, resolved)).toBe(path);
        }
        expect(formats[ext]).toEqual(["document", mime]);
      } finally {
        closeSync(fd);
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
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
