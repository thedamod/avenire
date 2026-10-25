import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { DesktopSetup } from "./setup.ts";

const mocks = vi.hoisted(() => ({
  access: vi.fn(() => false),
  external: vi.fn(async () => {}),
  command: vi.fn(async () => ({ stdout: "Preview\nStudy", stderr: "" })),
}));
vi.mock("electron", () => ({
  systemPreferences: { isTrustedAccessibilityClient: mocks.access },
  shell: { openExternal: mocks.external },
}));
vi.mock("./config.ts", () => ({ isWayland: false }));
vi.mock("node:child_process", () => {
  const execFile = () => {};
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: mocks.command,
  });
  return { execFile };
});
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function statePath() {
  const path = await mkdtemp(join(tmpdir(), "avenire-setup-"));
  directories.push(path);
  return join(path, "desktop-setup.json");
}

it("does not prompt or collect on first launch and persists the choice to continue without capture", async () => {
  const path = await statePath();
  const setup = new DesktopSetup(path, "darwin");
  await setup.load();
  expect(setup.completed).toBe(false);
  expect(setup.permissions.foregroundAvailable).toBe(false);
  expect(mocks.access).toHaveBeenCalledWith(false);
  expect(mocks.access).not.toHaveBeenCalledWith(true);
  expect(mocks.command).not.toHaveBeenCalled();
  await expect(setup.complete({ foregroundCapture: true })).rejects.toThrow("unavailable");
  await setup.complete({
    foregroundCapture: false,
    preferences: {
      studyDescription: "Physics, second year",
      materialSources: ["pdf", "lms"],
      resultsReadyBy: "07:00",
      timeZone: "UTC",
    },
    shortcuts: { capture: "Alt+C", prompt: "Alt+Shift+Space" },
    hotkeysEnabled: false,
    notificationsEnabled: true,
  });
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  const reloaded = new DesktopSetup(path, "darwin");
  await reloaded.load();
  expect(reloaded.completed).toBe(true);
  expect(reloaded.foregroundCapture).toBe(false);
  expect(reloaded.preferences).toMatchObject({
    studyDescription: "Physics, second year",
    resultsReadyBy: "07:00",
    materialSources: ["pdf", "lms"],
  });
  expect(reloaded.shortcuts).toEqual({ capture: "Alt+C", prompt: "Alt+Shift+Space" });
  expect(reloaded.hotkeysEnabled).toBe(false);
  expect(reloaded.notificationsEnabled).toBe(true);
  expect(reloaded.preferencesSynced).toBe(false);
  await reloaded.acknowledgePreferences();
  const synced = new DesktopSetup(path, "darwin");
  await synced.load();
  expect(synced.preferencesSynced).toBe(true);
});

it("requests macOS grants only after explicit interaction and rechecks revoked Accessibility", async () => {
  const path = await statePath();
  const setup = new DesktopSetup(path, "darwin");
  await setup.load();
  await setup.requestPermission("accessibility");
  expect(mocks.access).toHaveBeenCalledWith(true);
  expect(mocks.external).toHaveBeenCalledWith(expect.stringContaining("Privacy_Accessibility"));
  await expect(setup.requestPermission("automation")).rejects.toThrow("Accessibility first");
  expect(mocks.command).not.toHaveBeenCalled();
  mocks.access.mockReturnValue(true);
  await setup.requestPermission("automation");
  expect(mocks.command).toHaveBeenCalledWith(
    "osascript",
    ["-e", expect.stringContaining("System Events")],
    expect.objectContaining({ timeout: 60_000 }),
  );
  await setup.complete({ foregroundCapture: true });
  expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
    completed: true,
    foregroundCapture: true,
    automationGranted: true,
  });
  mocks.access.mockReturnValue(false);
  expect(setup.permissions.foregroundAvailable).toBe(false);
});

it("recovers corrupt state and detects missing Linux tools without granting capture", async () => {
  const path = await statePath();
  await writeFile(path, "broken");
  mocks.command.mockRejectedValue(new Error("tools missing"));
  const setup = new DesktopSetup(path, "linux");
  await setup.load();
  expect(setup.completed).toBe(false);
  expect(setup.permissions).toMatchObject({
    accessibility: "not-needed",
    foregroundAvailable: false,
  });
  expect(setup.permissions.foregroundNote).toContain("Wayland");
});

it("persists tray pause and shortcut changes without replaying synced preferences", async () => {
  const path = await statePath();
  const setup = new DesktopSetup(path, "darwin");
  await setup.complete({ foregroundCapture: false, notificationsEnabled: true });
  await setup.acknowledgePreferences();
  const shortcuts = { capture: "Alt+C", prompt: "Alt+Space" };
  await setup.saveShortcuts(shortcuts, false);
  const reloaded = new DesktopSetup(path, "darwin");
  await reloaded.load();
  expect(reloaded.hotkeysEnabled).toBe(false);
  expect(reloaded.shortcuts).toEqual(shortcuts);
  expect(reloaded.preferencesSynced).toBe(true);
  expect(reloaded.notificationsEnabled).toBe(true);
  await reloaded.saveShortcuts(shortcuts, true);
  expect(JSON.parse(await readFile(path, "utf8")).hotkeysEnabled).toBe(true);
});
