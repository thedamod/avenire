import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it("includes the overlay document, its referenced bundles and sandbox preload in the installer", async () => {
  const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  // Use the installed packager's actual config normalization and filters, rather than a
  // second hand-written glob matcher which could agree with a broken release config.
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
  const { getConfig } = builderRequire("app-builder-lib/out/util/config/config");
  const { getFileMatchers } = builderRequire("app-builder-lib/out/fileMatcher");
  const config = await getConfig(project, "electron-builder.yml", null);
  const html = await readFile(join(project, "src/overlay/index.html"), "utf8");
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
  const required = [
    "capture-overlay.html",
    "overlay-preload.cjs",
    ...references,
    "Geist-Regular.woff2",
    "Geist-Medium.woff2",
    "Geist-SemiBold.woff2",
    "GeistMono-Regular.woff2",
  ];
  const directory = await mkdtemp(join(tmpdir(), "avenire-package-test-"));
  try {
    const filters = getFileMatchers(config, "files", join(directory, "app"), {
      defaultSrc: directory,
      globalOutDir: join(project, "release"),
      macroExpander: (pattern: string) => pattern,
      customBuildOptions: config.win ?? {},
    }).map((matcher: { createFilter: () => (path: string, stats: unknown) => boolean }) =>
      matcher.createFilter(),
    );
    for (const name of required) {
      const path = join(directory, name);
      await writeFile(path, "fixture");
      const info = await stat(path);
      expect(
        filters.some((filter: (path: string, stats: unknown) => boolean) => filter(path, info)),
        `Installer excludes ${name}`,
      ).toBe(true);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
