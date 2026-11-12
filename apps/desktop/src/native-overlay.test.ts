import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadNativeOverlayConfig } from "./native-overlay.ts";
afterEach(() => vi.unstubAllEnvs());
it("enables an installed companion outside Wayland and preserves explicit disable", () => {
  vi.stubEnv("AVENIRE_NATIVE_OVERLAY_ENABLED", undefined);
  const root = mkdtempSync(join(tmpdir(), "avenire-native-test-"));
  mkdirSync(join(root, "native-dist"));
  writeFileSync(
    join(
      root,
      "native-dist",
      process.platform === "win32" ? "avenire-overlay.exe" : "avenire-overlay",
    ),
    "fixture",
  );
  try {
    expect(
      loadNativeOverlayConfig({
        packaged: false,
        resourcesPath: root,
        appPath: root,
        wayland: false,
      }).enabled,
    ).toBe(true);
    vi.stubEnv("DISPLAY", ":1");
    expect(
      loadNativeOverlayConfig({
        packaged: false,
        resourcesPath: root,
        appPath: root,
        wayland: true,
      }).xwayland,
    ).toBe(process.platform === "linux");
    vi.stubEnv("AVENIRE_NATIVE_OVERLAY_ENABLED", "false");
    expect(
      loadNativeOverlayConfig({
        packaged: false,
        resourcesPath: "/tmp",
        appPath: "/tmp",
        wayland: true,
      }).enabled,
    ).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
