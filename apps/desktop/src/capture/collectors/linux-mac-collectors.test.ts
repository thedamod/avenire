import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { getBackgroundMediaLinux } from "./background-media-linux.ts";
import { resolveDocumentPathLinux } from "./document-path-linux.ts";
import { createCaptureContext } from "./capture-context.ts";

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
