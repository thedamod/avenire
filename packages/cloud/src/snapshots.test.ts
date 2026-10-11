import { expect, it } from "@effect/vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { CHAT_SANDBOX_LIMITS } from "./chatSandbox.ts";
import { CLOUD_LIMITS } from "./cloudBox.ts";
import { AVENIRE_SNAPSHOT, SANDBOX_RESOURCES, avenireSandboxImage } from "./snapshots.ts";

const dockerfile = avenireSandboxImage.dockerfile;

it("defines one Daytona desktop image with all runtime stacks", () => {
  expect(AVENIRE_SNAPSHOT).toBe("avenire-sandbox-v1");
  expect(dockerfile).toContain("FROM daytonaio/sandbox");
  for (const packageName of [
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
  expect(dockerfile).toContain("corepack prepare pnpm@11.17.0 --activate");
  expect(dockerfile).toContain("playwright install --with-deps chromium");
  expect(dockerfile).toContain("from playwright.sync_api import sync_playwright");
  expect(dockerfile).not.toContain("@earendil-works/pi-coding-agent");
  expect(dockerfile).not.toContain("bun install");
});

it("bakes the wallpaper and an idempotent Xfce autostart", () => {
  expect(dockerfile).toContain("/usr/share/backgrounds/avenire/wallpaper.svg");
  expect(dockerfile).toContain("/usr/local/bin/avenire-set-wallpaper");
  expect(dockerfile).toContain("/home/daytona/.config/autostart/avenire-wallpaper.desktop");
  expect(dockerfile).toContain("ENV VNC_RESOLUTION=1024x768");
  const script = readFileSync(
    fileURLToPath(new URL("../assets/set-wallpaper.sh", import.meta.url)),
    "utf8",
  );
  expect(script).toContain("xfconf-query -c xfce4-desktop -lv");
  expect(script).toContain("/last-image$");
  const autostart = readFileSync(
    fileURLToPath(new URL("../assets/avenire-wallpaper.desktop", import.meta.url)),
    "utf8",
  );
  expect(autostart).toContain("Exec=/usr/local/bin/avenire-set-wallpaper");
  const wallpaper = readFileSync(
    fileURLToPath(new URL("../assets/wallpaper.svg", import.meta.url)),
    "utf8",
  );
  expect(wallpaper).toContain('viewBox="0 0 1024 768"');
  expect(wallpaper).toContain("<path d=");
});

it("keeps both sandbox allocations aligned to their one snapshot", () => {
  expect(CHAT_SANDBOX_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
  expect(CLOUD_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
});
