import { readFileSync } from "node:fs";

import { expect, it } from "@effect/vitest";

import { CHAT_SANDBOX_LIMITS } from "./chatSandbox.ts";
import { CLOUD_LIMITS } from "./cloudBox.ts";
import { AVENIRE_SNAPSHOT, SANDBOX_RESOURCES, avenireSandboxImage } from "./snapshots.ts";

const dockerfile = avenireSandboxImage.dockerfile;

it("defines one Daytona desktop image with all runtime stacks", () => {
  expect(AVENIRE_SNAPSHOT).toBe("avenire-sandbox-v4");
  expect(dockerfile).toContain("FROM daytonaio/sandbox");
  for (const packageName of [
    "bibata-cursor-theme",
    "papirus-icon-theme",
    "librsvg2-common",
    "arc-theme",
    "fonts-inter",
    "fonts-dejavu-core",
    "mousepad",
    "poppler-utils",
    "numpy",
    "scipy",
    "pandas",
    "sympy",
    "matplotlib",
    "networkx",
    "scikit-learn",
    "polars",
    "Pillow",
    "imageio",
    "openpyxl",
    "manimgx",
    "playwright",
    "build-essential",
    "pkg-config",
    "ffmpeg",
    "texlive-latex-base",
    "texlive-latex-extra",
    "texlive-fonts-recommended",
    "xvfb",
    "xfce4",
    "xfce4-terminal",
    "xfconf",
    "x11vnc",
    "novnc",
    "dbus-x11",
    "libx11-6",
    "libxrandr2",
    "libxext6",
    "libxrender1",
    "libxfixes3",
    "libxss1",
    "libxtst6",
    "libxi6",
  ])
    expect(dockerfile).toContain(packageName);
  expect(dockerfile).toContain("uv python install 3.13");
  expect(dockerfile).not.toContain("Python-3.12");
  expect(dockerfile).not.toMatch(/install[^;]* manim /);
  expect(dockerfile).toContain(
    "/opt/avenire/python/bin/python -m playwright install --with-deps chromium",
  );
  expect(dockerfile).toContain("/usr/bin/python3 -c 'import pcbnew'");
  expect(dockerfile).toContain("import pcbnew");
  expect(dockerfile).toContain("bookworm-backports");
  expect(dockerfile).toContain("-t bookworm-backports kicad");
  expect(dockerfile).toContain("kicad-cli version");
  expect(dockerfile).toContain("setup_24.x");
  for (const checksum of [
    "283cbef4bdaca819bd896b0dacb8a085c4c05dbc880642aa5001d97bc4db74ba",
    "6e3d580f5bd7ccf2aa1e8df8d35c60d78e873c3ff8beb282c9bebd914904ad72",
  ])
    expect(dockerfile).toContain(checksum);
  expect(dockerfile).toContain("sha256sum -c -");
  expect(dockerfile).toContain("npm install -g pnpm@11.17.0");
  expect(dockerfile).not.toContain("corepack");
  expect(dockerfile).toContain("playwright install --with-deps chromium");
  expect(dockerfile).toContain("from playwright.sync_api import sync_playwright");
  expect(dockerfile).not.toContain("@earendil-works/pi-coding-agent");
  expect(dockerfile).not.toContain("bun install");
});

it("fixes the display and bakes one clean bottom taskbar", () => {
  expect(dockerfile).toContain("VNC_RESOLUTION=1600x900");
  const asset = (file: string) =>
    readFileSync(new URL(`../assets/desktop/${file}`, import.meta.url), "utf8");
  const desktop = asset("xfce4-desktop.xml");
  expect(desktop).toContain("wallpaper.png");
  expect(desktop).toContain("monitorscreen");
  expect(desktop).toContain("monitor0");
  expect(desktop).toContain('name="style" type="int" value="0"');
  const panel = asset("xfce4-panel.xml");
  expect(panel).toContain('name="size" type="int" value="44"');
  expect(panel).not.toContain('name="panel-2"');
  for (const plugin of ["whiskermenu", "tasklist", "systray", "clock"])
    expect(panel).toContain(plugin);
  const wm = asset("xfwm4.xml");
  expect(wm).toContain('name="use_compositing" type="bool" value="false"');
  expect(wm).toContain('name="titleless_maximize" type="bool" value="true"');
  const settings = asset("xsettings.xml");
  expect(settings).toContain('name="DPI" type="int" value="96"');
  expect(settings).toContain('name="WindowScalingFactor" type="int" value="1"');
  expect(settings).toContain('name="RGBA" type="string" value="none"');
});

it("keeps both sandbox allocations aligned to their one snapshot", () => {
  expect(CHAT_SANDBOX_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
  expect(CLOUD_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
});

it("bakes the desktop configuration and usable browser launcher", () => {
  for (const file of [
    "xsettings.xml",
    "xfwm4.xml",
    "xfce4-panel.xml",
    "xfce4-desktop.xml",
    "terminalrc",
    "gtk.css",
    "index.theme",
    "avenire-browser",
    "browser.desktop",
    "terminal.desktop",
    "files.desktop",
    "editor.desktop",
    "browser-helper.desktop",
  ])
    expect(dockerfile).toContain(file);
  expect(dockerfile).toContain("XCURSOR_THEME=Bibata-Modern-Ice");
  expect(dockerfile).toContain("XCURSOR_SIZE=24");
  expect(dockerfile).toContain("chown -R daytona:daytona /home/daytona/.config");
  const settings = readFileSync(
    new URL("../assets/desktop/xsettings.xml", import.meta.url),
    "utf8",
  );
  expect(settings).toContain("Bibata-Modern-Ice");
  expect(settings).toContain("Papirus-Dark");
  expect(settings).toContain("Arc-Dark");
  const browser = readFileSync(
    new URL("../assets/desktop/avenire-browser", import.meta.url),
    "utf8",
  );
  expect(browser).toContain("--no-sandbox");
  expect(browser).toContain("/usr/bin/chromium");
  expect(browser).toContain("--start-maximized");
  expect(browser).toContain("--force-device-scale-factor=1");
  const policy = JSON.parse(
    readFileSync(new URL("../assets/desktop/chromium-policies.json", import.meta.url), "utf8"),
  );
  expect(policy.DefaultZoomLevel).toBe(0);
  expect(policy.DefaultNotificationsSetting).toBe(2);
  expect(policy.PasswordManagerEnabled).toBe(false);
});
