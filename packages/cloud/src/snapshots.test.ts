import { expect, it } from "@effect/vitest";

import { CHAT_SANDBOX_LIMITS } from "./chatSandbox.ts";
import { CLOUD_LIMITS } from "./cloudBox.ts";
import { AVENIRE_SNAPSHOT, SANDBOX_RESOURCES, avenireSandboxImage } from "./snapshots.ts";

const dockerfile = avenireSandboxImage.dockerfile;

it("defines one Daytona desktop image with all runtime stacks", () => {
  expect(AVENIRE_SNAPSHOT).toBe("avenire-sandbox-v3");
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
  expect(dockerfile).toContain("npm install -g pnpm@11.17.0");
  expect(dockerfile).not.toContain("corepack");
  expect(dockerfile).toContain("playwright install --with-deps chromium");
  expect(dockerfile).toContain("from playwright.sync_api import sync_playwright");
  expect(dockerfile).not.toContain("@earendil-works/pi-coding-agent");
  expect(dockerfile).not.toContain("bun install");
});

it("keeps Daytona's default black desktop (no custom wallpaper)", () => {
  expect(dockerfile).not.toContain("wallpaper");
  expect(dockerfile).not.toContain("autostart");
});

it("keeps both sandbox allocations aligned to their one snapshot", () => {
  expect(CHAT_SANDBOX_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
  expect(CLOUD_LIMITS.resources).toEqual(SANDBOX_RESOURCES);
});
