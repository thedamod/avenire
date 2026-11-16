import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, rm, realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DesktopShortcuts, DesktopShortcutSetupStatus } from "@avenire/contracts";

type Binding = { modmask: number; key: string; command: string };
type Manifest = { version: 1; path: string; block: string; bindings: Binding[] };
type Options = {
  configDirectory: string;
  stateDirectory: string;
  launch: readonly string[];
  run: (args: readonly string[]) => Promise<string>;
};
const marker = "AVENIRE MANAGED SHORTCUTS";
const modifiers: Record<string, number> = {
  control: 4,
  ctrl: 4,
  commandorcontrol: 4,
  cmdorctrl: 4,
  alt: 8,
  option: 8,
  shift: 1,
  super: 64,
  meta: 64,
  command: 64,
};
const names: Record<string, string> = {
  space: "space",
  enter: "Return",
  return: "Return",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  backspace: "BackSpace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "Prior",
  pagedown: "Next",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};
function chord(accelerator: string): Pick<Binding, "modmask" | "key"> {
  const parts = accelerator.split("+");
  const key = parts.pop()?.toLowerCase() ?? "";
  let modmask = 0;
  for (const part of parts) {
    const bit = modifiers[part.toLowerCase()];
    if (!bit || modmask & bit)
      throw new Error("Choose a shortcut with distinct Control, Alt, Shift or Super modifiers.");
    modmask |= bit;
  }
  if (!modmask || !(names[key] || /^[a-z0-9]$|^f(?:[1-9]|1\d|2[0-4])$/.test(key)))
    throw new Error(
      "Choose a shortcut with a modifier and a letter, number, function key or navigation key.",
    );
  return { modmask, key: names[key] ?? key.toUpperCase() };
}
function keys(binding: Binding, separator: string): string {
  return [
    binding.modmask & 64 ? "SUPER" : "",
    binding.modmask & 4 ? "CTRL" : "",
    binding.modmask & 8 ? "ALT" : "",
    binding.modmask & 1 ? "SHIFT" : "",
  ]
    .filter(Boolean)
    .join(separator);
}
function sameKey(a: { modmask: number; key: string }, b: { modmask: number; key: string }) {
  return a.modmask === b.modmask && a.key.toLowerCase() === b.key.toLowerCase();
}
async function optional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
async function atomic(path: string, value: string, mode = 0o600, expected?: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, { mode, flag: "wx" });
    if (expected !== undefined && (await readFile(path, "utf8")) !== expected)
      throw new Error(
        "Your Hyprland configuration changed during setup. The new changes were preserved.",
      );
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** A user-authorized, transactional addition to the default Hyprland config.
 * Inspection never creates files, reloads the compositor, or registers shortcuts.
 */
export class HyprlandShortcuts {
  private readonly manifestPath: string;
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
    this.manifestPath = join(options.stateDirectory, "hyprland-shortcuts.json");
  }
  private bindings(shortcuts: DesktopShortcuts): Binding[] {
    if (
      !this.options.launch.length ||
      // oxlint-disable-next-line no-control-regex -- Never interpolate control characters into config or shell literals.
      this.options.launch.some((arg) => /[\u0000-\u001f]/.test(arg))
    )
      throw new Error("A stable Avenire launch path is required to install desktop shortcuts.");
    const command = this.options.launch
      .map((arg) => `'${arg.replaceAll("'", "'\"'\"'")}'`)
      .join(" ");
    const bindings = [
      { ...chord(shortcuts.capture), command: `${command} --avenire-capture` },
      { ...chord(shortcuts.prompt), command: `${command} --avenire-prompt` },
    ];
    if (sameKey(bindings[0]!, bindings[1]!))
      throw new Error("Capture and Ask Ava need different shortcuts.");
    return bindings;
  }
  private async snapshot() {
    const candidates = [
      join(this.options.configDirectory, "hyprland.lua"),
      join(this.options.configDirectory, "hyprland.conf"),
    ];
    const roots = (
      await Promise.all(candidates.map(async (path) => ({ path, text: await optional(path) })))
    ).filter((entry) => entry.text !== undefined);
    if (roots.length !== 1)
      throw new Error(
        "Avenire needs one default hyprland.lua or hyprland.conf to set up shortcuts. Continue without hotkeys or configure your custom desktop manually.",
      );
    const root = roots[0]!;
    const path = await realpath(root.path); // Preserve a user's config symlink.
    const raw = await optional(this.manifestPath);
    let manifest: Manifest | undefined;
    if (raw !== undefined) {
      const value = JSON.parse(raw) as Manifest;
      if (
        value.version !== 1 ||
        value.path !== path ||
        typeof value.block !== "string" ||
        !Array.isArray(value.bindings) ||
        value.bindings.length !== 2 ||
        !value.bindings.every(
          (b) =>
            Number.isInteger(b.modmask) &&
            typeof b.key === "string" &&
            typeof b.command === "string",
        )
      )
        throw new Error(
          "The saved Avenire shortcut installation does not match this desktop. Restore it before changing shortcuts.",
        );
      manifest = value;
    }
    const text = root.text!;
    if (manifest && (text.split(manifest.block).length !== 2 || !manifest.block.includes(marker)))
      throw new Error(
        "The Avenire shortcut block was edited. Your changes were preserved; resolve the block before installing again.",
      );
    if (text.split(marker).length - 1 !== (manifest ? 2 : 0))
      throw new Error(
        "An unverified Avenire shortcut block already exists. Your configuration was left unchanged.",
      );
    return {
      path,
      text,
      raw,
      manifest,
      lua: root.path.endsWith(".lua"),
      mode: (await stat(path)).mode & 0o777,
    };
  }
  private async active() {
    const data: unknown = JSON.parse(await this.options.run(["-j", "binds"]));
    if (
      !Array.isArray(data) ||
      data.length > 10000 ||
      data.some(
        (b) =>
          !b ||
          !Number.isInteger(b.modmask) ||
          typeof b.key !== "string" ||
          typeof b.dispatcher !== "string" ||
          typeof b.arg !== "string",
      )
    )
      throw new Error("Hyprland did not provide a usable shortcut inventory.");
    return data as Array<{
      modmask: number;
      key: string;
      keycode?: number;
      dispatcher: string;
      arg: string;
    }>;
  }
  private conflicts(
    bindings: Binding[],
    active: Awaited<ReturnType<HyprlandShortcuts["active"]>>,
    owned: Binding[],
  ) {
    const conflicts = bindings.map((wanted) =>
      active.some(
        (b) =>
          b.modmask === wanted.modmask &&
          (sameKey(b, wanted) || (b.keycode ?? 0) > 0) &&
          !owned.some((own) => sameKey(own, b) && b.dispatcher === "exec" && b.arg === own.command),
      ),
    );
    return { capture: conflicts[0] ?? false, prompt: conflicts[1] ?? false };
  }
  async inspect(shortcuts: DesktopShortcuts): Promise<DesktopShortcutSetupStatus> {
    try {
      const bindings = this.bindings(shortcuts);
      const snapshot = await this.snapshot();
      const active = await this.active();
      const conflicts = this.conflicts(bindings, active, snapshot.manifest?.bindings ?? []);
      if (conflicts.capture || conflicts.prompt)
        return {
          backend: "hyprland",
          state: "conflict",
          conflicts,
          note: "A desktop shortcut is already in use. Choose another key combination; Avenire will not replace it.",
        };
      const installed =
        !!snapshot.manifest &&
        bindings.every((b) =>
          active.some((a) => sameKey(a, b) && a.dispatcher === "exec" && a.arg === b.command),
        ) &&
        JSON.stringify(bindings) === JSON.stringify(snapshot.manifest.bindings);
      return {
        backend: "hyprland",
        state: installed ? "ready" : "not-configured",
        conflicts,
        note: installed
          ? "Desktop shortcuts are installed in your Hyprland configuration."
          : "Allow global hotkeys to install Avenire's shortcuts in your Hyprland configuration.",
      };
    } catch (error) {
      return {
        backend: "unsupported",
        state: "unavailable",
        conflicts: { capture: false, prompt: false },
        note: (error instanceof Error
          ? error.message
          : "Hyprland shortcut setup is unavailable."
        ).slice(0, 500),
      };
    }
  }
  async apply(shortcuts: DesktopShortcuts, enabled: boolean): Promise<void> {
    if (!enabled && (await optional(this.manifestPath)) === undefined) return;
    const snapshot = await this.snapshot();
    if (!enabled && !snapshot.manifest) return;
    const bindings = enabled ? this.bindings(shortcuts) : [];
    const conflicts = this.conflicts(
      bindings,
      await this.active(),
      snapshot.manifest?.bindings ?? [],
    );
    if (conflicts.capture || conflicts.prompt)
      throw new Error(
        "A desktop shortcut is already in use. Choose another shortcut; existing bindings were not changed.",
      );
    const existingErrors = (await this.options.run(["configerrors"])).trim();
    if (existingErrors)
      throw new Error(
        "Fix the existing Hyprland configuration errors before installing shortcuts.",
      );
    if (!snapshot.lua && this.options.launch.some((arg) => /[$#\\]/.test(arg)))
      throw new Error(
        "This launch path cannot be represented safely in the legacy Hyprland config.",
      );
    const comment = snapshot.lua ? "--" : "#";
    const lines = bindings.map((b) =>
      snapshot.lua
        ? `hl.bind(${JSON.stringify(`${keys(b, " + ")} + ${b.key}`)}, hl.dsp.exec_cmd(${JSON.stringify(b.command)}))`
        : `bind = ${keys(b, " ")}, ${b.key}, exec, ${b.command}`,
    );
    const block = enabled
      ? `\n${comment} BEGIN ${marker}\n${lines.join("\n")}\n${comment} END ${marker}\n`
      : "";
    const next = snapshot.manifest
      ? snapshot.text.replace(snapshot.manifest.block, block)
      : snapshot.text + block;
    if (next === snapshot.text) {
      const status = await this.inspect(shortcuts);
      if (status.state === "ready") return;
    }
    if ((await readFile(snapshot.path, "utf8")) !== snapshot.text)
      throw new Error(
        "Your Hyprland config changed during setup. Retry to preserve the latest changes.",
      );
    // Keep a durable copy before changing user configuration.
    await atomic(join(this.options.stateDirectory, "hyprland-shortcuts-backup"), snapshot.text);
    let written = false;
    try {
      await atomic(snapshot.path, next, snapshot.mode, snapshot.text);
      written = true;
      await this.options.run(["reload"]);
      if ((await this.options.run(["configerrors"])).trim())
        throw new Error("Hyprland rejected the shortcut configuration.");
      const active = await this.active();
      const appliedConflicts = this.conflicts(bindings, active, bindings);
      if (
        appliedConflicts.capture ||
        appliedConflicts.prompt ||
        (enabled
          ? !bindings.every((b) =>
              active.some((a) => sameKey(a, b) && a.dispatcher === "exec" && a.arg === b.command),
            )
          : snapshot.manifest!.bindings.some((b) =>
              active.some((a) => sameKey(a, b) && a.dispatcher === "exec" && a.arg === b.command),
            ))
      )
        throw new Error(
          "Hyprland did not apply the requested shortcuts. The previous configuration will be restored.",
        );
      if (enabled)
        await atomic(
          this.manifestPath,
          JSON.stringify({ version: 1, path: snapshot.path, block, bindings } satisfies Manifest),
        );
      else await rm(this.manifestPath, { force: true });
    } catch (error) {
      if (written) {
        try {
          if ((await readFile(snapshot.path, "utf8")) !== next)
            throw new Error(
              "The config was edited while setup was running; automatic rollback would overwrite those changes.",
              { cause: error },
            );
          await atomic(snapshot.path, snapshot.text, snapshot.mode, next);
          if (snapshot.raw === undefined) await rm(this.manifestPath, { force: true });
          else await atomic(this.manifestPath, snapshot.raw);
          await this.options.run(["reload"]);
          if ((await this.options.run(["configerrors"])).trim())
            throw new Error("The restored configuration still reports errors.", { cause: error });
        } catch (rollback) {
          throw new AggregateError(
            [error, rollback],
            "Shortcut setup failed and could not fully restore the configuration. A backup is saved in Avenire's data directory.",
            { cause: rollback },
          );
        }
      }
      throw error;
    }
  }
}
