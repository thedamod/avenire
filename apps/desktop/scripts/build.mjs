import * as Esbuild from "esbuild";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { validateAppUrl } from "../src/app-url.ts";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
const appUrl = validateAppUrl(
  Effect.runSync(
    Config.String("AVENIRE_APP_URL").pipe(Config.withDefault("http://localhost:3000")),
  ),
);
await writeFile("dist/desktop-config.json", JSON.stringify({ appUrl }, null, 2));
console.log(`Desktop web server: ${appUrl}`);

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  sourcemap: "external",
  minify: true,
  external: ["electron"],
};

await Promise.all([
  Esbuild.build({ ...shared, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" }),
  Esbuild.build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" }),
  Esbuild.build({
    ...shared,
    entryPoints: ["src/setup-preload.ts"],
    outfile: "dist/setup-preload.cjs",
  }),
  Esbuild.build({
    ...shared,
    entryPoints: ["src/overlay-preload.ts"],
    outfile: "dist/overlay-preload.cjs",
  }),
  Esbuild.build({
    ...shared,
    entryPoints: ["src/boot.ts"],
    outfile: "dist/boot.cjs",
    external: ["electron", "./main.cjs"],
  }),
  Esbuild.build({
    bundle: true,
    minify: true,
    platform: "browser",
    target: "chrome144",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: ["../web/src/features/onboarding/desktop-entry.tsx"],
    outfile: "dist/onboarding.js",
  }),
  // The global capture overlay renders the app's own capture rows in an always-on-top window.
  Esbuild.build({
    bundle: true,
    minify: true,
    platform: "browser",
    target: "chrome144",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: ["../web/src/features/capture/overlay-entry.tsx"],
    outfile: "dist/capture-overlay.js",
  }),
]);
await cp("src/onboarding/index.html", "dist/onboarding.html");
await cp("src/overlay/index.html", "dist/capture-overlay.html");
// The standalone renderer uses the exact web components/tokens; no separate desktop theme.
const webRequire = createRequire(new URL("../../web/package.json", import.meta.url));
// Rasterize the existing web favicon, so Windows installer, taskbar and app chrome share one source.
const sharp = createRequire(webRequire.resolve("next/package.json"))("sharp");
const svg = await readFile("../web/src/app/icon.svg");
await cp("../web/src/app/icon.svg", "dist/icon.svg");
await cp("../web/public/branding/avenire-mark-white.png", "dist/tray.png");
await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile("dist/icon.png");
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(
  sizes.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer()),
);
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index] === 256 ? 0 : sizes[index];
  directory[entry + 1] = directory[entry];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile("dist/icon.ico", Buffer.concat([directory, ...pngs]));
const tailwind = webRequire("@tailwindcss/postcss");
const postcss = createRequire(webRequire.resolve("@tailwindcss/postcss"))("postcss");
for (const [entry, output] of [
  ["../web/src/features/onboarding/desktop.css", "onboarding.css"],
  ["../web/src/features/capture/overlay.css", "capture-overlay.css"],
]) {
  const from = resolve(entry);
  const generated = await postcss([tailwind({ base: resolve("../web"), optimize: true })]).process(
    await readFile(from, "utf8"),
    { from },
  );
  // esbuild emits a sibling .css for CSS imported by the entry; keep it after the utilities.
  const bundled = await readFile(`dist/${output}`, "utf8").catch(() => "");
  await writeFile(`dist/${output}`, generated.css + "\n" + bundled);
}
const fontRoot = resolve(dirname(webRequire.resolve("geist/font/sans")), "..");
await Promise.all(
  ["Regular", "Medium", "SemiBold"].map((weight) =>
    cp(`${fontRoot}/dist/fonts/geist-sans/Geist-${weight}.woff2`, `dist/Geist-${weight}.woff2`),
  ),
);
await cp(
  `${fontRoot}/dist/fonts/geist-mono/GeistMono-Regular.woff2`,
  "dist/GeistMono-Regular.woff2",
);
await cp(`${fontRoot}/LICENSE.TXT`, "dist/Geist-LICENSE.txt");

// Execute each preload with only Electron's sandbox API: no filesystem, package or chunk requires.
for (const [file, globalName] of [
  ["preload.cjs", "avenire"],
  ["setup-preload.cjs", "avenireSetup"],
  ["overlay-preload.cjs", "avenireOverlay"],
]) {
  let exposed;
  runInNewContext(
    await readFile(`dist/${file}`, "utf8"),
    {
      process: { platform: "linux" },
      require: (name) => {
        if (name !== "electron") throw new Error(`Unsupported sandbox preload import: ${name}`);
        return {
          contextBridge: {
            exposeInMainWorld: (name, api) => {
              if (name === globalName) exposed = api;
            },
          },
          ipcRenderer: { invoke: async () => undefined, on() {}, removeListener() {} },
        };
      },
    },
    { timeout: 1000 },
  );
  if (!exposed) throw new Error(`${file} did not expose ${globalName}`);
}

// Package only bundled runtime artifacts. No workspace links or duplicate Effect/contract trees.
const source = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  "dist/package.json",
  JSON.stringify(
    {
      name: source.name,
      version: source.version,
      description: "Avenire desktop",
      author: "Avenire",
      main: "boot.cjs",
    },
    null,
    2,
  ),
);
for (const file of [
  "main.cjs",
  "preload.cjs",
  "setup-preload.cjs",
  "overlay-preload.cjs",
  "onboarding.js",
  "capture-overlay.js",
]) {
  console.log(`${file}: ${(await stat(`dist/${file}`)).size} bytes`);
}
