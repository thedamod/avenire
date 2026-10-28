import { mkdtemp, readFile, rm, stat, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { LocalOriginRegistry } from "./registry.ts";
import { loadInstallIdentity } from "./identity.ts";
import { validLocalPath, validateRegisteredFile } from "./reopen.ts";
import { createHash } from "node:crypto";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function temp() {
  const path = await mkdtemp(join(tmpdir(), "capture-registry-test-"));
  directories.push(path);
  return path;
}

it("persists a random install identity independent of account and machine hashes", async () => {
  const directory = await temp();
  const first = loadInstallIdentity(directory);
  expect(first.deviceId).toMatch(/^[a-f0-9]{32}$/);
  expect(first.deviceName).toBeTruthy();
  expect(loadInstallIdentity(directory)).toEqual(first);
  expect(loadInstallIdentity(await temp()).deviceId).not.toBe(first.deviceId);
  if (process.platform !== "win32")
    expect((await stat(join(directory, "capture-install.json"))).mode & 0o777).toBe(0o600);
});

it("serializes atomic registry updates, persists entries and isolates owners", async () => {
  const path = join(await temp(), "registry.json");
  const registry = new LocalOriginRegistry(path);
  await registry.load();
  const origin = {
    path: "/home/student/study.pdf",
    sha256: "a".repeat(64),
    sizeBytes: 20,
    mtimeMs: 100,
    appName: "Preview",
  };
  await Promise.all([
    registry.record("alice", "file-a", origin),
    registry.record("alice", "file-b", { ...origin, sizeBytes: 30 }),
    registry.record("bob", "file-a", { ...origin, path: "/home/other/study.pdf" }),
  ]);
  const restored = new LocalOriginRegistry(path);
  await restored.load();
  expect(restored.get("alice", "file-a")).toEqual(origin);
  expect(restored.get("alice", "file-b")?.sizeBytes).toBe(30);
  expect(restored.get("bob", "file-a")?.path).toBe("/home/other/study.pdf");
  expect(restored.get("other", "file-a")).toBeUndefined();
  expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
  if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
});

it("rejects relative, UNC/device, executable, shortcut, ADS and executable bundle paths", () => {
  for (const path of [
    "relative.pdf",
    "//server/study.pdf",
    "\\\\server\\study.pdf",
    "\\\\?\\C:\\study.pdf",
    "\\Device\\HarddiskVolume1\\study.pdf",
    "/tmp/file\0.pdf",
    "/tmp/run.EXE",
    "/tmp/run.sh",
    "/tmp/link.desktop",
    "/Applications/Bad.app/Contents/MacOS/data.pdf",
    "C:\\study.pdf:evil.exe",
    "C:\\evil.exe. ",
    "/tmp/doc.lnk",
    "/tmp/start.jar",
  ])
    expect(validLocalPath(path), path).toBe(false);
  expect(validLocalPath("/home/student/study.pdf")).toBe(true);
  expect(validLocalPath("C:\\Users\\Student\\study.pdf")).toBe(true);
});

it("validates the real target, refuses directories/symlink executables, and detects changed files", async () => {
  const directory = await temp();
  const path = join(directory, "study.pdf");
  await writeFile(path, "original");
  const info = await stat(path);
  const origin = {
    path,
    sha256: createHash("sha256").update("original").digest("hex"),
    sizeBytes: info.size,
    mtimeMs: info.mtimeMs,
  };
  expect(await validateRegisteredFile(origin)).toMatchObject({ path, changed: false });
  await writeFile(path, "changed bytes");
  expect(await validateRegisteredFile(origin)).toMatchObject({ changed: true });
  expect(await validateRegisteredFile({ ...origin, path: directory })).toBeUndefined();
  await writeFile(join(directory, "bad.exe"), "executable");
  await symlink(join(directory, "bad.exe"), join(directory, "innocent.pdf"));
  expect(
    await validateRegisteredFile({ ...origin, path: join(directory, "innocent.pdf") }),
  ).toBeUndefined();
});

it("persists validated browser capture windows for reuse after restart and isolates them by owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "capture-registry-download-"));
  try {
    const path = join(directory, "registry.json");
    const registry = new LocalOriginRegistry(path);
    await registry.load();
    const entry = {
      path: "/Downloads/Avenire/request-id/Handout.pdf",
      sizeBytes: 10,
      mtimeMs: 123,
      sha256: "a".repeat(64),
      download: {
        captureId: "request-id",
        startedAt: 100,
        endedAt: 200,
        url: "https://school.test/file",
      },
    };
    await registry.record("alice", "file-id", entry);
    const restarted = new LocalOriginRegistry(path);
    await restarted.load();
    expect(restarted.downloads("alice")).toEqual([
      { path: entry.path, sizeBytes: 10, download: entry.download },
    ]);
    expect(restarted.downloads("bob")).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
