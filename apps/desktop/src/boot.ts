import { app } from "electron";
import { enableCompileCache } from "node:module";
import { join } from "node:path";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { usesWayland } from "./display-selection.ts";

// Wayland forbids global window positioning and cursor coordinates. The capture
// popup needs both for corner placement and hover interaction. Keep capture
// collectors on the real session type, but render Electron through XWayland.
// An explicit --ozone-platform choice always wins; pure Wayland stays supported
// when no X server is available, with compositor-controlled popup placement.
if (process.platform === "linux" && !app.commandLine.hasSwitch("ozone-platform")) {
  const display = Effect.runSync(
    Config.all({
      session: Config.String("XDG_SESSION_TYPE").pipe(Config.withDefault("")),
      wayland: Config.String("WAYLAND_DISPLAY").pipe(Config.withDefault("")),
      x11: Config.String("DISPLAY").pipe(Config.withDefault("")),
    }),
  );
  if (usesWayland(process.platform, display.session, display.wayland) && display.x11.length > 0)
    app.commandLine.appendSwitch("ozone-platform", "x11");
}

// Match the Windows shell identity before creating any windows.
if (process.platform === "win32") app.setAppUserModelId("space.avenire.desktop");

// Run before requiring the main bundle so warm launches can reuse its V8 code.
// Cache is optional and lives in this installation's private userData directory.
if (app.isPackaged && !app.getAppPath().includes("/.mount_")) {
  try {
    enableCompileCache(join(app.getPath("userData"), "compile-cache"));
  } catch {
    /* A read-only cache must not prevent startup. */
  }
}
require("./main.cjs");
