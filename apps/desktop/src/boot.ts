import { app } from "electron";
import { enableCompileCache } from "node:module";
import { join } from "node:path";

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
