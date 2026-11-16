import { execFile } from "node:child_process";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { shell, systemPreferences } from "electron";
import { DesktopOnboardingPreferences, DesktopShortcuts } from "@avenire/contracts";
import type { DesktopPermission, DesktopSetupChoice, DesktopSetupStatus } from "@avenire/contracts";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";

const command = promisify(execFile);
// Constant scripts only. No renderer-controlled code or shell interpolation.
export const foregroundScript =
  'tell application "System Events" to tell first process whose frontmost is true to return name & linefeed & (name of front window)';
const settingsUrls = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  automation: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
} as const;

export class DesktopSetup {
  completed = false;
  foregroundCapture = false;
  hotkeysEnabled = true;
  notificationsEnabled = false;
  preferences: DesktopOnboardingPreferences | undefined;
  shortcuts: DesktopShortcuts | undefined;
  preferencesSynced = false;
  private automationGranted = false;
  private foregroundTools = false;
  private foregroundWayland = false;
  private permissionRequest: Promise<void> | undefined;

  private readonly path: string;
  private readonly platform: NodeJS.Platform;
  constructor(path: string, platform = process.platform) {
    this.path = path;
    this.platform = platform;
  }

  async load(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, "utf8"));
      if (
        typeof value === "object" &&
        value !== null &&
        "version" in value &&
        value.version === 1 &&
        "completed" in value &&
        value.completed === true &&
        "foregroundCapture" in value &&
        typeof value.foregroundCapture === "boolean"
      ) {
        this.completed = true;
        this.foregroundCapture = value.foregroundCapture;
        this.automationGranted = "automationGranted" in value && value.automationGranted === true;
        this.hotkeysEnabled = !("hotkeysEnabled" in value) || value.hotkeysEnabled === true;
        this.notificationsEnabled =
          "notificationsEnabled" in value && value.notificationsEnabled === true;
        this.preferencesSynced = "preferencesSynced" in value && value.preferencesSynced === true;
        if ("preferences" in value)
          this.preferences = Option.getOrUndefined(
            Schema.decodeUnknownOption(DesktopOnboardingPreferences)(value.preferences),
          );
        if ("shortcuts" in value)
          this.shortcuts = Option.getOrUndefined(
            Schema.decodeUnknownOption(DesktopShortcuts)(value.shortcuts),
          );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn("Desktop setup state could not be read; setup will run again.");
    }
    if (this.platform === "linux") {
      const wayland = await import("./config.ts").then((config) => config.isWayland);
      if (wayland) {
        try {
          const result = await command("hyprctl", ["activewindow", "-j"], { timeout: 1200 });
          const value: unknown = JSON.parse(result.stdout);
          this.foregroundTools = value !== null && typeof value === "object" && !Array.isArray(value);
          this.foregroundWayland = this.foregroundTools;
        } catch {
          this.foregroundTools = false;
          this.foregroundWayland = false;
        }
      } else {
        const results = await Promise.allSettled([
          command("xdotool", ["version"], { timeout: 1200 }),
          command("xprop", ["-version"], { timeout: 1200 }),
        ]);
        // xprop -version is not supported everywhere; executable presence is enough.
        this.foregroundTools =
          results[0]?.status === "fulfilled" &&
          (results[1]?.status === "fulfilled" ||
            (results[1]?.status === "rejected" &&
              (results[1].reason as NodeJS.ErrnoException).code !== "ENOENT"));
      }
    }
  }

  get permissions(): Pick<
    DesktopSetupStatus,
    "accessibility" | "automation" | "foregroundAvailable" | "foregroundNote"
  > {
    if (this.platform === "darwin") {
      const accessibility = systemPreferences.isTrustedAccessibilityClient(false)
        ? "granted"
        : "required";
      return {
        accessibility,
        automation: this.automationGranted ? "granted" : "required",
        foregroundAvailable: accessibility === "granted" && this.automationGranted,
        foregroundNote:
          "Accessibility and Automation let Avenire read the active app and window title. Automation reflects the last explicit permission check.",
      };
    }
    return {
      accessibility: "not-needed",
      automation: "not-needed",
      foregroundAvailable: this.platform === "win32" || this.foregroundTools,
      foregroundNote:
        this.platform === "win32"
          ? "Windows can read the active app and window title without a separate OS prompt."
          : this.foregroundTools
            ? this.foregroundWayland
              ? "Foreground capture uses Hyprland to read the active app and window title."
              : "Foreground capture uses xdotool and xprop in your X11 session."
            : "Foreground capture needs Hyprland on Wayland, or xdotool and xprop on X11. Browser capture and uploads are also available.",
    };
  }

  async requestPermission(permission: DesktopPermission): Promise<void> {
    if (this.permissionRequest) return this.permissionRequest;
    this.permissionRequest = this.request(permission);
    try {
      await this.permissionRequest;
    } finally {
      this.permissionRequest = undefined;
    }
  }

  private async request(permission: DesktopPermission): Promise<void> {
    if (this.platform !== "darwin") return;
    if (permission === "accessibility") {
      if (!systemPreferences.isTrustedAccessibilityClient(true))
        await shell.openExternal(settingsUrls.accessibility);
      return;
    }
    if (!systemPreferences.isTrustedAccessibilityClient(false))
      throw new Error("Enable Accessibility first, then allow Automation.");
    try {
      // Invoked only from the user's Allow Automation button. This may show Apple's prompt.
      await command("osascript", ["-e", foregroundScript], {
        timeout: 60_000,
        maxBuffer: 64 * 1024,
      });
      this.automationGranted = true;
    } catch {
      this.automationGranted = false;
      await shell.openExternal(settingsUrls.automation);
      throw new Error(
        "Automation was not granted. Enable Avenire → System Events in System Settings, then try again.",
      );
    }
  }

  async complete(choice: DesktopSetupChoice): Promise<void> {
    if (choice.foregroundCapture && !this.permissions.foregroundAvailable)
      throw new Error("Foreground capture is unavailable. Grant access or continue without it.");
    this.preferences = choice.preferences ?? this.preferences;
    this.shortcuts = choice.shortcuts ?? this.shortcuts;
    this.hotkeysEnabled = choice.hotkeysEnabled ?? this.hotkeysEnabled;
    this.notificationsEnabled = choice.notificationsEnabled ?? this.notificationsEnabled;
    this.foregroundCapture = choice.foregroundCapture;
    this.preferencesSynced = false;
    await this.persist();
    this.completed = true;
  }

  /** Update tray/hotkey preferences without replaying onboarding preferences. */
  async saveShortcuts(shortcuts: DesktopShortcuts, enabled: boolean): Promise<void> {
    const previous = { shortcuts: this.shortcuts, enabled: this.hotkeysEnabled };
    this.shortcuts = shortcuts;
    this.hotkeysEnabled = enabled;
    try {
      await this.persist();
    } catch (error) {
      this.shortcuts = previous.shortcuts;
      this.hotkeysEnabled = previous.enabled;
      throw error;
    }
  }

  async acknowledgePreferences(): Promise<void> {
    this.preferencesSynced = true;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify({
        version: 1,
        completed: true,
        foregroundCapture: this.foregroundCapture,
        automationGranted: this.automationGranted,
        preferences: this.preferences,
        shortcuts: this.shortcuts,
        hotkeysEnabled: this.hotkeysEnabled,
        notificationsEnabled: this.notificationsEnabled,
        preferencesSynced: this.preferencesSynced,
      }),
      { mode: 0o600 },
    );
    await rename(temporary, this.path);
  }
}
