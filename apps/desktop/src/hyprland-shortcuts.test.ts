import { mkdtemp, mkdir, readFile, writeFile, rm, rename, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { HyprlandShortcuts } from "./hyprland-shortcuts.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const choices = { capture: "Control+Shift+C", prompt: "Alt+Space" };
type Active = { modmask: number; key: string; dispatcher: string; arg: string };
function parseKey(keys: string): Pick<Active, "modmask" | "key"> {
  const parts = keys.split(/\s*\+\s*/);
  const key = parts.pop()!;
  return {
    key,
    modmask: parts.reduce((n, key) => n | ({ CTRL: 4, ALT: 8, SHIFT: 1, SUPER: 64 }[key] ?? 0), 0),
  };
}
async function fixture(lua: boolean) {
  const root = await mkdtemp(join(tmpdir(), "avenire-shortcut-onboarding-"));
  roots.push(root);
  const configDirectory = join(root, "hypr");
  const stateDirectory = join(root, "app-data");
  await mkdir(configDirectory);
  const path = join(configDirectory, lua ? "hyprland.lua" : "hyprland.conf");
  const original = lua
    ? '-- My desktop\nhl.bind("SUPER + E", hl.dsp.exec_cmd("files"))\n'
    : "# My desktop\nbind = SUPER, E, exec, files\n";
  await writeFile(path, original);
  const external: Active[] = [{ modmask: 64, key: "E", dispatcher: "exec", arg: "files" }];
  let active = [...external];
  let rejectReload = false;
  let failRollback = false;
  let errors = "";
  let beforeReload = async () => {};
  const run = vi.fn(async (args: readonly string[]) => {
    if (args[0] === "reload") {
      await beforeReload();
      if (rejectReload) {
        rejectReload = false;
        throw new Error("reload failed");
      }
      if (failRollback) throw new Error("rollback failed");
      const text = await readFile(path, "utf8");
      active = [...external];
      const block =
        text
          .split("BEGIN AVENIRE MANAGED SHORTCUTS")[1]
          ?.split("END AVENIRE MANAGED SHORTCUTS")[0] ?? "";
      for (const line of block.split("\n")) {
        if (lua) {
          const found =
            /^hl\.bind\(("(?:[^"\\]|\\.)*"), hl\.dsp\.exec_cmd\(("(?:[^"\\]|\\.)*")\)\)$/.exec(
              line,
            );
          if (found)
            active.push({
              ...parseKey(JSON.parse(found[1]!)),
              dispatcher: "exec",
              arg: JSON.parse(found[2]!),
            });
        } else {
          const found = /^bind = (.*?), (.*?), exec, (.*)$/.exec(line);
          if (found)
            active.push({
              ...parseKey(`${found[1]!.replaceAll(" ", " + ")} + ${found[2]}`),
              dispatcher: "exec",
              arg: found[3]!,
            });
        }
      }
      return "ok";
    }
    if (args[0] === "configerrors") return errors;
    if (args[0] === "-j" && args[1] === "binds") return JSON.stringify(active);
    throw new Error("Unexpected compositor operation");
  });
  const options = { configDirectory, stateDirectory, launch: ["/opt/Avenire's App.AppImage"], run };
  return {
    path,
    original,
    options,
    run,
    external,
    manager: new HyprlandShortcuts(options),
    active: () => active,
    setActive: (value: Active[]) => {
      active = value;
    },
    rejectNextReload: () => {
      rejectReload = true;
    },
    setErrors: (value: string) => {
      errors = value;
    },
    beforeReload: (hook: () => Promise<void>) => {
      beforeReload = hook;
    },
    failAllReloads: () => {
      rejectReload = true;
      failRollback = true;
    },
  };
}

it.each([true, false])(
  "installs, verifies, survives relaunch, updates and removes only owned bindings (Lua=%s)",
  async (lua) => {
    const h = await fixture(lua);
    if (lua) {
      await rename(h.path, `${h.path}.target`);
      await symlink(`${h.path}.target`, h.path);
    }
    expect((await h.manager.inspect(choices)).state).toBe("not-configured");
    expect(h.run.mock.calls.every(([args]) => args[0] !== "reload")).toBe(true);
    expect(await readFile(h.path, "utf8")).toBe(h.original);
    await h.manager.apply(choices, false);
    expect(await readFile(h.path, "utf8")).toBe(h.original);
    await h.manager.apply(choices, true);
    expect((await h.manager.inspect(choices)).state).toBe("ready");
    expect(h.active()).toHaveLength(3);
    expect(h.active()[0]).toEqual(h.external[0]);
    expect(h.active().some((b) => b.arg.includes("--avenire-capture"))).toBe(true);
    expect(h.active().some((b) => b.arg.includes("--avenire-prompt"))).toBe(true);
    const installed = await readFile(h.path, "utf8");
    const afterRestart = new HyprlandShortcuts(h.options);
    await afterRestart.apply(choices, true);
    expect(await readFile(h.path, "utf8")).toBe(installed);
    const changed = { ...choices, prompt: "Alt+Shift+Space" };
    await afterRestart.apply(changed, true);
    expect(h.active().filter((b) => b.key.toLowerCase() === "space")).toEqual([
      expect.objectContaining({ modmask: 9 }),
    ]);
    await afterRestart.apply(changed, false);
    expect(await readFile(h.path, "utf8")).toBe(h.original);
    expect(h.active()).toEqual(h.external);
    if (lua) expect((await lstat(h.path)).isSymbolicLink()).toBe(true);
  },
);

it("leaves conflicting desktop bindings and user-edited managed blocks untouched", async () => {
  const h = await fixture(true);
  const conflict = { modmask: 8, key: "space", dispatcher: "exec", arg: "launcher" };
  h.setActive([...h.external, conflict]);
  expect((await h.manager.inspect(choices)).conflicts.prompt).toBe(true);
  await expect(h.manager.apply(choices, true)).rejects.toThrow("already in use");
  expect(await readFile(h.path, "utf8")).toBe(h.original);
  expect(h.run.mock.calls.some(([args]) => args[0] === "reload")).toBe(false);
  h.setActive([...h.external]);
  await h.manager.apply(choices, true);
  const edited = (await readFile(h.path, "utf8")).replace("--avenire-prompt", "--my-custom-action");
  await writeFile(h.path, edited);
  await expect(h.manager.apply(choices, false)).rejects.toThrow("was edited");
  expect(await readFile(h.path, "utf8")).toBe(edited);
});

it("restores the exact previous config on reload failure and reports failed rollback", async () => {
  const h = await fixture(false);
  h.rejectNextReload();
  await expect(h.manager.apply(choices, true)).rejects.toThrow("reload failed");
  expect(await readFile(h.path, "utf8")).toBe(h.original);
  expect((await h.manager.inspect(choices)).state).toBe("not-configured");
  expect(h.run.mock.calls.filter(([args]) => args[0] === "reload")).toHaveLength(2);
  h.failAllReloads();
  await expect(h.manager.apply(choices, true)).rejects.toThrow("could not fully restore");
  expect(await readFile(h.path, "utf8")).toBe(h.original);
});

it("does not install over broken configs, duplicate chords or unsupported launch paths", async () => {
  const h = await fixture(false);
  h.setErrors("existing error");
  await expect(h.manager.apply(choices, true)).rejects.toThrow("existing Hyprland");
  expect(await readFile(h.path, "utf8")).toBe(h.original);
  h.setErrors("");
  await expect(
    h.manager.apply({ capture: "Ctrl+Shift+A", prompt: "Shift+Control+a" }, true),
  ).rejects.toThrow("different");
  await expect(
    new HyprlandShortcuts({ ...h.options, launch: [] }).apply(choices, true),
  ).rejects.toThrow("stable");
  await rm(h.path);
  expect((await h.manager.inspect(choices)).state).toBe("unavailable");
  await h.manager.apply(choices, false);
});

it("preserves concurrent config edits and leaves the original backup for manual recovery", async () => {
  const h = await fixture(true);
  let edited = "";
  h.beforeReload(async () => {
    edited = `${await readFile(h.path, "utf8")}\n-- Concurrent user edit\n`;
    await writeFile(h.path, edited);
    throw new Error("Compositor reload failed");
  });
  await expect(h.manager.apply(choices, true)).rejects.toThrow("could not fully restore");
  expect(await readFile(h.path, "utf8")).toBe(edited);
  expect(await readFile(join(h.options.stateDirectory, "hyprland-shortcuts-backup"), "utf8")).toBe(
    h.original,
  );
});
