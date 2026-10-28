import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { initializeCaptureLog, captureLog, captureError, scrubCaptureText } from "./diagnostics.ts";
import { captureFailureReason } from "./failure.ts";

it("preserves the real failure while scrubbing Windows, NT, POSIX and file URL paths in messages and stacks", () => {
  const error = Object.assign(
    new Error("read 'C:\\Users\\Private Student\\Essay.docx' failed at '/home/private/a.pdf'"),
    { code: "EPERM" },
  );
  const logged = captureError(error);
  expect(logged).toMatchObject({ name: "Error", code: "EPERM" });
  expect(logged.message).toContain("Essay.docx");
  expect(JSON.stringify(logged)).not.toMatch(/Users|Private Student|home\/private/);
  for (const path of [
    String.raw`\Device\HarddiskVolume3\Users\private\Lecture.mp4`,
    "file:///Users/private/Essay.pdf",
    String.raw`\\?\C:\Users\private\Essay.pdf`,
  ]) {
    expect(scrubCaptureText(`failed '${path}'`)).not.toMatch(/private|Users|HarddiskVolume/);
  }
  expect(captureFailureReason(new Error("Source changed during capture; capture again."))).toBe(
    "Could not save this file: Source changed during capture; capture again.",
  );
});

it("writes stage counts and complete errors to three bounded rotating files", async () => {
  const root = await mkdtemp(join(tmpdir(), "capture-logs-"));
  try {
    const path = initializeCaptureLog(root);
    for (let i = 0; i < 120; i++)
      captureLog("Collected", { count: i, message: "x".repeat(31_000) });
    captureLog(
      "Source failed",
      captureError(Object.assign(new Error("failed '/private/source.pdf'"), { code: "EBUSY" })),
    );
    expect((await readdir(root)).sort()).toEqual(["capture.log", "capture.log.1", "capture.log.2"]);
    for (const name of await readdir(root))
      expect((await stat(join(root, name))).size).toBeLessThanOrEqual(1024 * 1024);
    const log = await readFile(path, "utf8");
    expect(log).toContain('"stage":"Source failed"');
    expect(log).toContain('"stack":');
    expect(log).toContain('"code":"EBUSY"');
    expect(log).not.toContain("/private");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
