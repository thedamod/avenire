import { app } from "electron";
import { DEFAULT_DESKTOP_CAPTURE_SHORTCUT } from "@avenire/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateAppUrl } from "./app-url.ts";
import { usesWayland } from "./display-selection.ts";

function buildAppUrl(): string {
  if (!app.isPackaged) return "http://localhost:3000";
  // The build stores only its public origin, never the build machine's environment.
  const value = JSON.parse(readFileSync(join(app.getAppPath(), "desktop-config.json"), "utf8"));
  if (typeof value.appUrl !== "string")
    throw new Error("Desktop server configuration is missing. Rebuild Avenire.");
  return validateAppUrl(value.appUrl);
}

const config = Effect.runSync(
  Config.all({
    url: Config.String("AVENIRE_APP_URL").pipe(Config.withDefault(buildAppUrl())),
    promptShortcut: Config.String("AVENIRE_PROMPT_SHORTCUT").pipe(Config.withDefault("Alt+Space")),
    sessionType: Config.String("XDG_SESSION_TYPE").pipe(Config.withDefault("")),
    waylandDisplay: Config.String("WAYLAND_DISPLAY").pipe(Config.withDefault("")),
    powerShellOneShot: Config.String("AVENIRE_PS_ONESHOT").pipe(Config.withDefault("")),
    captureAppData: Config.String("APPDATA").pipe(Config.withDefault("")),
    captureConfigHome: Config.String("XDG_CONFIG_HOME").pipe(Config.withDefault("")),
    extensionIds: Config.String("AVENIRE_EXTENSION_IDS").pipe(Config.withDefault("")),
  }),
);
export const appUrl = validateAppUrl(config.url);
export const defaultCaptureShortcut = DEFAULT_DESKTOP_CAPTURE_SHORTCUT;
export const defaultPromptShortcut = config.promptShortcut;
export const fallbackPromptShortcut = "Alt+Shift+Space";
export const extensionReceiverPort = 17842;
export const isWayland = usesWayland(process.platform, config.sessionType, config.waylandDisplay);
export const powerShellOneShot = config.powerShellOneShot.length > 0;
export const captureAppData = config.captureAppData;
export const captureConfigHome = config.captureConfigHome;
export const extensionIds = new Set([
  "gdegpabcfhonkcnecpgaekplbfmopace",
  ...config.extensionIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^[a-p]{32}$/.test(id)),
]);
