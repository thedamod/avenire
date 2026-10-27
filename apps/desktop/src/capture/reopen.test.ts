import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { LibraryFile, ReopenPlan } from "@avenire/contracts";
import { LocalOriginRegistry } from "./registry.ts";
import { executeReopen, positionCommand } from "./reopen.ts";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as LibraryFile["id"];
async function harness() {
  const directory = await mkdtemp(join(tmpdir(), "capture-reopen-test-"));
  directories.push(directory);
  const registry = new LocalOriginRegistry(join(directory, "registry.json"));
  await registry.load();
  return {
    directory,
    registry,
    owner: "alice",
    deviceId: "install",
    getFile: vi.fn<() => Promise<LibraryFile>>(async () => {
      throw new Error("No owned file");
    }),
    opened: vi.fn(async () => {}),
    openPath: vi.fn(async () => ""),
    openExternal: vi.fn(async () => {}),
    exec: vi.fn(async () => {}),
  };
}

it("refuses unregistered ids, a different owner, executable files and mismatched plan ids", async () => {
  const h = await harness();
  const path = join(h.directory, "run.exe");
  await writeFile(path, "code");
  const info = await stat(path);
  const entry = {
    path,
    sha256: createHash("sha256").update("code").digest("hex"),
    sizeBytes: info.size,
    mtimeMs: info.mtimeMs,
  };
  expect(await executeReopen(id, undefined, h)).toEqual({ ok: false, note: "missing" });
  await h.registry.record(h.owner, id, entry);
  expect(await executeReopen(id, undefined, h)).toEqual({ ok: false, note: "missing" });
  expect(await executeReopen(id, undefined, { ...h, owner: "bob" })).toEqual({
    ok: false,
    note: "missing",
  });
  const plan: ReopenPlan = {
    _tag: "OpenLocal",
    fileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as typeof id,
    fileName: "run.exe",
  };
  expect((await executeReopen(id, plan, h)).ok).toBe(false);
  expect(h.openPath).not.toHaveBeenCalled();
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.exec).not.toHaveBeenCalled();
});

it("opens only the registered real path, reports modifications, and records successful opens", async () => {
  const h = await harness();
  const path = join(h.directory, "study.pdf");
  await writeFile(path, "original");
  const info = await stat(path);
  await h.registry.record(h.owner, id, {
    path,
    sha256: createHash("sha256").update("original").digest("hex"),
    sizeBytes: info.size,
    mtimeMs: info.mtimeMs,
  });
  const plan = {
    _tag: "OpenLocal",
    fileId: id,
    fileName: "/attacker/run.sh",
    appName: "malicious",
  } as ReopenPlan;
  expect(await executeReopen(id, plan, h)).toEqual({ ok: true });
  expect(h.openPath).toHaveBeenCalledWith(path);
  expect(h.opened).toHaveBeenCalledWith(id);
  await writeFile(path, "changed");
  expect(await executeReopen(id, plan, h)).toEqual({ ok: true, note: "changed-since-capture" });
  expect(h.exec).not.toHaveBeenCalled();
  expect(positionCommand("darwin", path, "Preview", { pdfPage: 5 })).toEqual({
    file: "/usr/bin/open",
    args: ["-a", "Preview", path],
  });
});

it("derives URLs from the owned LibraryFile and falls back after a failed extension focus", async () => {
  const h = await harness();
  h.getFile.mockResolvedValue({
    id,
    origin: {
      _tag: "Web",
      url: "https://example.com/study?course=physics&token=secret",
      title: "Study",
      browser: "chrome",
      capturedAt: "now",
      position: { pdfPage: 7 },
    },
  } as LibraryFile);
  const extension = { connected: () => true, reopen: vi.fn(async () => false) };
  expect(
    await executeReopen(
      id,
      { _tag: "FocusTab", url: "file:///attacker/run.exe" },
      { ...h, extension },
    ),
  ).toEqual({ ok: true });
  expect(extension.reopen).toHaveBeenCalledWith("https://example.com/study?course=physics", {
    pdfPage: 7,
  });
  expect(h.openExternal).toHaveBeenCalledWith("https://example.com/study?course=physics#page=7");
  h.openExternal.mockClear();
  extension.reopen.mockResolvedValue(true);
  expect((await executeReopen(id, undefined, { ...h, extension })).ok).toBe(true);
  expect(h.openExternal).not.toHaveBeenCalled();
  expect((await executeReopen(id, undefined, { ...h, stillOwner: () => false })).ok).toBe(false);
});

it("distinguishes a file captured on another device from a missing local file", async () => {
  const h = await harness();
  const origin = {
    _tag: "LocalFile" as const,
    deviceId: "another-install",
    deviceName: "Other computer",
    platform: "win32" as const,
    fileName: "study.pdf",
    sizeBytes: 8,
    sha256: "a".repeat(64),
    capturedAt: "2026-10-25T00:00:00Z",
  };
  h.getFile.mockResolvedValue({ id, origin } as LibraryFile);
  expect(await executeReopen(id, undefined, h)).toEqual({ ok: false, note: "other-device" });
  h.getFile.mockResolvedValue({ id, origin: { ...origin, deviceId: h.deviceId } } as LibraryFile);
  expect(await executeReopen(id, undefined, h)).toEqual({ ok: false, note: "missing" });
  expect(h.openPath).not.toHaveBeenCalled();
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.opened).not.toHaveBeenCalled();
});

it("refuses non-http origins returned by the server and never opens the renderer URL", async () => {
  const h = await harness();
  for (const url of [
    "file:///etc/private",
    "javascript:alert(1)",
    "https://user:secret@example.com/",
  ]) {
    h.getFile.mockResolvedValue({
      id,
      origin: { _tag: "Web", url, title: "Study", browser: "chrome", capturedAt: "now" },
    } as LibraryFile);
    expect((await executeReopen(id, { _tag: "OpenUrl", url: "https://attacker.test" }, h)).ok).toBe(
      false,
    );
  }
  expect(h.openExternal).not.toHaveBeenCalled();
  expect(h.openPath).not.toHaveBeenCalled();
});
